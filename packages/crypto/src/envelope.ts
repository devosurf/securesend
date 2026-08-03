import { base64urlToBytes, bytesToBase64url } from "./base64url";
import { composeDataKey } from "./compose";
import {
  encodeFragmentToken,
  type FragmentToken,
  newFragmentToken,
} from "./fragment";
import { newSecretId } from "./ids";
import { randomBytes } from "./random";
import { utf8 } from "./utf8";

/** Bumped when the plaintext shape changes, so an old envelope stays readable. */
const ENVELOPE_VERSION = 1;

const IV_BYTES = 12;

/**
 * Every ciphertext is bound to the row it belongs to, and an attachment also to
 * its position. The envelope and its attachments share one data key, so this is
 * the only thing stopping a ciphertext from being served under another id, at
 * another index, or in place of the envelope itself.
 */
const AAD_PREFIX = "securesend:v1";

export interface Credentials {
  password: string;
  username: string;
}

/** A file on its way in. Its size is taken from the bytes, never declared. */
export interface FileToSeal {
  bytes: Uint8Array<ArrayBuffer>;
  name: string;
  type: string;
}

/**
 * What a sender seals. At least one part has to be there. An empty file list is
 * no files; whether an empty note is worth sending is the create form's call.
 *
 * Inputs accept an explicit `undefined` so callers can hand over form state
 * directly. What comes back out never does: an absent part has no key at all.
 */
export interface EnvelopeParts {
  credentials?: Credentials | undefined;
  files?: readonly FileToSeal[] | undefined;
  note?: string | undefined;
}

/** base64url, which is how every one of these travels and how the API takes it. */
export interface Ciphertext {
  ciphertext: string;
  iv: string;
}

export interface AttachmentCiphertext {
  ciphertext: string;
  index: number;
  iv: string;
}

/**
 * Everything the server holds, and nothing it may not. This is what the create
 * request carries and what a reveal hands back, so it is safe to serialize
 * whole. The key is deliberately not in here.
 */
export interface StoredEnvelope {
  attachments: AttachmentCiphertext[];
  envelope: Ciphertext;
  id: string;
}

export interface SealedEnvelope {
  /**
   * Belongs after the `#` of the secret link, and nowhere else, ever. It is kept
   * out of `stored` so that posting an envelope cannot post the key by accident.
   */
  fragmentToken: string;
  stored: StoredEnvelope;
}

export interface OpenedFile {
  bytes: Uint8Array<ArrayBuffer>;
  name: string;
  size: number;
  type: string;
}

export interface OpenedEnvelope {
  credentials?: Credentials;
  /** Always an array, empty when the envelope carried no files. */
  files: OpenedFile[];
  note?: string;
}

/**
 * A wrong password, a wrong key, a tampered ciphertext and a ciphertext moved to
 * another id are one error on purpose. Locally we could tell some of them apart;
 * saying which would be the verifier we promised not to build.
 */
export class DecryptionFailedError extends Error {
  constructor() {
    super("decryption failed: wrong key, wrong password, or tampered data");
    this.name = "DecryptionFailedError";
  }
}

/** Decryption succeeded and what came out still does not add up. */
export class InvalidEnvelopeError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "InvalidEnvelopeError";
  }
}

interface EnvelopeFile {
  name: string;
  size: number;
  type: string;
}

interface EnvelopeContents {
  credentials?: Credentials;
  files: EnvelopeFile[];
  note?: string;
}

function envelopeAad(id: string): Uint8Array<ArrayBuffer> {
  return utf8(`${AAD_PREFIX}:envelope:${id}`);
}

function attachmentAad(id: string, index: number): Uint8Array<ArrayBuffer> {
  return utf8(`${AAD_PREFIX}:attachment:${id}:${index}`);
}

/**
 * A fresh 96-bit IV per ciphertext. An envelope holds a note and a handful of
 * attachments under a key that exists for that one envelope, so random IVs are
 * nowhere near the birthday bound that makes GCM nonce reuse dangerous.
 */
async function encrypt(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  additionalData: Uint8Array<ArrayBuffer>
): Promise<Ciphertext> {
  const iv = randomBytes(IV_BYTES);
  const sealed = await crypto.subtle.encrypt(
    { additionalData, iv, name: "AES-GCM" },
    key,
    plaintext
  );

  return {
    ciphertext: bytesToBase64url(new Uint8Array(sealed)),
    iv: bytesToBase64url(iv),
  };
}

/** Every way this can fail is the same failure, including unreadable base64url. */
async function decrypt(
  key: CryptoKey,
  sealed: Ciphertext,
  additionalData: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          additionalData,
          iv: base64urlToBytes(sealed.iv),
          name: "AES-GCM",
        },
        key,
        base64urlToBytes(sealed.ciphertext)
      )
    );
  } catch {
    // A cause would carry which of the four ways this failed, and telling them
    // apart is the verifier we promised not to build.
    // biome-ignore lint/style/useErrorCause: this error has to say nothing
    throw new DecryptionFailedError();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCredentials(value: unknown): value is Credentials {
  if (!isRecord(value)) {
    return false;
  }

  const { username, password } = value;

  return typeof username === "string" && typeof password === "string";
}

function isEnvelopeFile(value: unknown): value is EnvelopeFile {
  if (!isRecord(value)) {
    return false;
  }

  const { name, size, type } = value;

  return (
    typeof name === "string" &&
    typeof type === "string" &&
    typeof size === "number" &&
    Number.isInteger(size) &&
    size >= 0
  );
}

function isEnvelopeFiles(value: unknown): value is EnvelopeFile[] {
  return Array.isArray(value) && value.every(isEnvelopeFile);
}

function readContents(plaintext: Uint8Array<ArrayBuffer>): EnvelopeContents {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    // A JSON syntax error quotes the text around the break, and that text is
    // the decrypted secret. A cause would put a piece of the plaintext into
    // every log that catches this.
    // biome-ignore lint/style/useErrorCause: the cause would carry plaintext
    throw new InvalidEnvelopeError("the envelope is not json");
  }

  if (!isRecord(parsed)) {
    throw new InvalidEnvelopeError("the envelope is not an object");
  }

  const { v, note, credentials, files } = parsed;

  if (v !== ENVELOPE_VERSION) {
    throw new InvalidEnvelopeError(
      `not a version ${ENVELOPE_VERSION} envelope`
    );
  }
  if (note !== undefined && typeof note !== "string") {
    throw new InvalidEnvelopeError("the note is not text");
  }
  if (credentials !== undefined && !isCredentials(credentials)) {
    throw new InvalidEnvelopeError("the credentials are not a pair of strings");
  }
  if (files !== undefined && !isEnvelopeFiles(files)) {
    throw new InvalidEnvelopeError("the file list is not file metadata");
  }
  if (note === undefined && credentials === undefined && files === undefined) {
    throw new InvalidEnvelopeError("the envelope has no parts");
  }

  return {
    ...(note !== undefined && { note }),
    ...(credentials !== undefined && { credentials }),
    files: files ?? [],
  };
}

/**
 * Seals one envelope: the note, the credentials and the file metadata as one
 * JSON ciphertext, and each file's bytes as its own ciphertext under the same
 * data key. So the server never holds a filename, and a 10MB attachment never
 * inflates the part every envelope has.
 *
 * The id and the key are generated here. On an id collision the server rejects
 * the insert and the caller seals again: nothing has been shared yet, so a
 * fresh id and a fresh key cost nothing.
 */
export async function sealEnvelope(
  parts: EnvelopeParts,
  password?: string
): Promise<SealedEnvelope> {
  const files = parts.files ?? [];

  if (
    parts.note === undefined &&
    parts.credentials === undefined &&
    files.length === 0
  ) {
    throw new Error("an envelope needs at least one part");
  }
  if (password === "") {
    throw new Error("a password cannot be empty");
  }

  const id = newSecretId();
  const token = newFragmentToken(password !== undefined);
  const key = await composeDataKey(token, password);

  const contents = {
    v: ENVELOPE_VERSION,
    ...(parts.note !== undefined && { note: parts.note }),
    ...(parts.credentials !== undefined && { credentials: parts.credentials }),
    ...(files.length > 0 && {
      files: files.map((source) => ({
        name: source.name,
        size: source.bytes.length,
        type: source.type,
      })),
    }),
  };

  const [envelope, attachments] = await Promise.all([
    encrypt(key, utf8(JSON.stringify(contents)), envelopeAad(id)),
    Promise.all(
      files.map(async (source, index) => ({
        index,
        ...(await encrypt(key, source.bytes, attachmentAad(id, index))),
      }))
    ),
  ]);

  return {
    fragmentToken: encodeFragmentToken(token),
    stored: { attachments, envelope, id },
  };
}

/**
 * Opens one envelope, or throws. Nothing here touches the network or any
 * storage: a wrong password fails on the ciphertext already in this tab, which
 * is why the recipient can simply try again.
 *
 * It opens as one. An attachment that did not arrive, arrived twice, or came
 * back the wrong size fails the whole envelope rather than handing over a
 * partial secret that reads as a whole one.
 */
export async function openEnvelope(input: {
  stored: StoredEnvelope;
  token: FragmentToken;
  password?: string | undefined;
}): Promise<OpenedEnvelope> {
  const { attachments, envelope, id } = input.stored;
  const key = await composeDataKey(input.token, input.password);
  const contents = readContents(await decrypt(key, envelope, envelopeAad(id)));

  const byIndex = new Map(
    attachments.map((attachment) => [attachment.index, attachment])
  );
  if (byIndex.size !== attachments.length) {
    throw new InvalidEnvelopeError("two attachments claim one index");
  }
  // Counts and sizes come out of the decrypted envelope, so they stay out of
  // these messages: an error that gets logged must carry no part of a secret.
  if (byIndex.size !== contents.files.length) {
    throw new InvalidEnvelopeError(
      "the attachments do not match what the envelope declares"
    );
  }

  const files = await Promise.all(
    contents.files.map(async (meta, index) => {
      const attachment = byIndex.get(index);
      if (!attachment) {
        throw new InvalidEnvelopeError(`attachment ${index} is missing`);
      }

      const bytes = await decrypt(key, attachment, attachmentAad(id, index));
      if (bytes.length !== meta.size) {
        throw new InvalidEnvelopeError(
          `attachment ${index} is not the size the envelope declares`
        );
      }

      return { ...meta, bytes };
    })
  );

  return {
    ...(contents.note !== undefined && { note: contents.note }),
    ...(contents.credentials !== undefined && {
      credentials: contents.credentials,
    }),
    files,
  };
}

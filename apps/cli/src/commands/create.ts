import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { text as readAll } from "node:stream/consumers";
import {
  type EnvelopeParts,
  type FileToSeal,
  sealEnvelope,
} from "@securesend/crypto/envelope";
import { type CreateBody, createSecret, type Expiry } from "../client";
import { INSTANCE_VARIABLE, instanceForCreate } from "../instance";
import { secretHref } from "../link";
import { askHidden, askPassword, atTheKeyboard } from "../prompt";

/*
 * Sealing a secret and handing back one link.
 *
 * Everything of consequence happens before the request: the id, the key and the
 * ciphertext are all made here, and the key goes into the link rather than into
 * the body. The instance stores bytes it cannot read and answers with the
 * management token, which is the sender's whole authority over what they sent.
 *
 * The link is the only thing on stdout, so `securesend create | pbcopy` is a
 * whole workflow. Everything else the sender is owed goes to stderr, where a
 * pipe leaves it on the screen.
 */

/** Enough for a collision to be bad luck, few enough to notice a broken instance. */
const SEAL_ATTEMPTS = 4;

export const EXPIRIES: readonly Expiry[] = ["1h", "24h", "72h"];

export interface CreateOptions {
  expiry: string;
  file: string[];
  instance?: string | undefined;
  password?: boolean | undefined;
  text?: string | undefined;
}

export interface Shared {
  expiresAt: string;
  href: string;
  id: string;
  managementToken: string;
}

export interface Sending {
  expiry: Expiry;
  origin: string;
  parts: EnvelopeParts;
  password?: string | undefined;
}

export function expiryOf(value: string): Expiry {
  const preset = EXPIRIES.find((offered) => offered === value);
  if (preset === undefined) {
    throw new Error("an expiry is 1h, 24h or 72h");
  }

  return preset;
}

/**
 * The sentence that hands a sender their authority over what they just sent.
 * The link in it carries no fragment, because burning takes the id and the token
 * and never the key: this line pasted into a chat is not a secret given away.
 */
export function burnLine(
  origin: string,
  id: string,
  managementToken: string
): string {
  return `burn with: securesend burn ${origin}/s/${id} --token ${managementToken}`;
}

/**
 * Seals and posts, sealing again under a fresh id and key while the instance
 * says the id is taken. Recursive rather than a loop because each attempt is a
 * whole new secret rather than a retry of the last one.
 */
export async function sealAndSend(sending: Sending): Promise<Shared> {
  async function attempt(left: number): Promise<Shared> {
    const sealed = await sealEnvelope(sending.parts, sending.password);
    const body: CreateBody = {
      attachments: sealed.stored.attachments,
      envelope: sealed.stored.envelope,
      expiry: sending.expiry,
      id: sealed.stored.id,
    };

    const created = await createSecret(sending.origin, body);
    if (created === null) {
      if (left <= 1) {
        throw new Error("that instance would take no id we offered it");
      }

      return await attempt(left - 1);
    }

    return {
      expiresAt: created.expiresAt,
      href: secretHref(sending.origin, created.id, sealed.fragmentToken),
      id: created.id,
      managementToken: created.managementToken,
    };
  }

  return await attempt(SEAL_ATTEMPTS);
}

/**
 * A file on its way into an envelope. Its name travels inside the ciphertext
 * with its bytes, so the instance never learns what anything was called, and the
 * type is left empty: there is nothing here to sniff it with, and a guess in
 * that field is a guess the recipient's browser would then act on.
 */
async function fileToSeal(path: string): Promise<FileToSeal> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    /* The path is the sender's own and not the secret, so it can be named. */
    throw new Error(`could not read ${path}`, { cause: error });
  }

  return { bytes: new Uint8Array(bytes), name: basename(path), type: "" };
}

/**
 * The note, from the flag or from whatever was piped in.
 *
 * With files attached, stdin is never read: a note beside files arrives with
 * --text. Reading it anyway would mean waiting for a pipe to close, and in the
 * agent and CI shells this command is for, stdin is routinely open and silent,
 * which turns a finished create into a hang.
 *
 * A shell puts a newline on the end of an echo and a heredoc, and that newline
 * is almost never part of the secret, so exactly one comes off. Exactly one: a
 * secret that genuinely ends in a blank line still arrives whole.
 */
async function noteFrom(
  given: string | undefined,
  files: number
): Promise<string | undefined> {
  if (given !== undefined) {
    return given;
  }
  if (files > 0) {
    return;
  }

  if (atTheKeyboard()) {
    throw new Error(
      "there is nothing to send: pass --text, attach --file, or pipe the secret in"
    );
  }

  const piped = await readAll(process.stdin);
  const note = piped.endsWith("\n") ? piped.slice(0, -1) : piped;

  return note === "" ? undefined : note;
}

/**
 * A password nobody has typed twice is a password the recipient will not have.
 * Confirmed only at a keyboard: headless it comes from the environment, where
 * there is nothing to mistype and nothing to confirm it against.
 */
async function newPassword(): Promise<string> {
  if (!atTheKeyboard()) {
    return await askPassword();
  }

  const first = await askHidden("Password: ");
  if (first === "") {
    throw new Error("no password was given");
  }

  const again = await askHidden("Password again: ");
  if (again !== first) {
    throw new Error("those two passwords are not the same");
  }

  return first;
}

export async function create(options: CreateOptions): Promise<number> {
  const origin = instanceForCreate(
    options.instance,
    process.env[INSTANCE_VARIABLE]
  );
  const expiry = expiryOf(options.expiry);
  const files = await Promise.all(options.file.map(fileToSeal));
  const note = await noteFrom(options.text, files.length);

  if (note === undefined && files.length === 0) {
    throw new Error("there is nothing to send");
  }

  const password = options.password === true ? await newPassword() : undefined;
  const shared = await sealAndSend({
    expiry,
    origin,
    parts: { files, note },
    password,
  });

  process.stdout.write(`${shared.href}\n`);
  process.stderr.write(`expires ${shared.expiresAt}\n`);
  process.stderr.write(
    `${burnLine(origin, shared.id, shared.managementToken)}\n`
  );

  return 0;
}

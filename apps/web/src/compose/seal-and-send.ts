import { sealEnvelope } from "@securesend/crypto/envelope";
import type { InferRequestType } from "hono/client";
import { apiClient, type ClientOptions } from "../api/client";
import { type Kept, remember } from "./remember";

/*
 * The sender's whole crossing, from what they typed to a link they can paste.
 *
 * Everything that matters happens here, in this order: the browser makes a key
 * and an id, encrypts the envelope under them, posts the ciphertext, and keeps
 * the management token the instance hands back. The key never goes into the
 * request. It goes into the link, after the hash, which browsers do not send.
 *
 * The id is the client's, so a collision is the client's to fix: the instance
 * refuses the insert and this seals again under a fresh id and a fresh key.
 * Nothing has been shared yet, so that costs the sender nothing.
 *
 * Nothing here is ever logged. Every value in scope is either a secret, a key, or
 * a management token, so an error that carried a detail would be an error that
 * carried one of those.
 */

type Post = ReturnType<typeof apiClient>["api"]["secrets"]["$post"];

/** The three the api takes, so the picker cannot offer a fourth. */
export type Expiry = InferRequestType<Post>["json"]["expiry"];

const KIB = 1024;

/**
 * This browser's mirror of the instance's cap, which is `MAX_ENVELOPE_BYTES` on
 * the server and the same number by default. The instance is the authority; this
 * is here so a sender who pasted a novel is told before anything is encrypted or
 * uploaded rather than after.
 */
export const MAX_ENVELOPE_BYTES = 256 * KIB;

/**
 * What the envelope costs beyond the sender's own text: the version, the key
 * names, the punctuation and the authentication tag. Deliberately generous, and
 * deliberately not exact, because json escaping means the true size of a note
 * full of quotes is not knowable without building the note. When this mirror
 * guesses low the instance refuses the envelope and says so.
 */
const SCAFFOLDING_BYTES = 256;

/** Enough for a collision to be bad luck, few enough to notice a broken instance. */
const SEAL_ATTEMPTS = 4;

const CREATED = 201;
const CONFLICT = 409;
const TOO_LARGE = 413;

const SCHEME = /^https?:\/\//;

const utf8 = new TextEncoder();

export type SendProblem = "too-big" | "refused" | "unreachable";

export interface SendFailure extends ErrorOptions {
  /** Bytes: the cap that was hit, whoever refused the envelope for it. */
  limit?: number | undefined;
}

/**
 * Why the secret was not sent, in the three shapes a sender can be told about.
 * Nothing narrower, because there is nothing narrower this browser knows: the
 * instance does not say why it refused, and it should not.
 */
export class SendFailedError extends Error {
  problem: SendProblem;
  limit: number | undefined;

  constructor(problem: SendProblem, failure: SendFailure = {}) {
    super(`the secret was not sent: ${problem}`, failure);
    this.name = "SendFailedError";
    this.limit = failure.limit;
    this.problem = problem;
  }
}

export interface Draft {
  credentials?: { password: string; username: string } | undefined;
  expiry: Expiry;
  note?: string | undefined;
  /** What the recipient must also have. Absent means the link is enough. */
  password?: string | undefined;
}

export interface SecretLink {
  /** ISO, as the instance recorded it. */
  expiresAt: string;
  /** The whole link. This is what belongs on a clipboard and in a message. */
  href: string;
  id: string;
  /** The same link without its scheme, which is what belongs on a screen. */
  shown: string;
}

/** What this module talks to, so a test can hand it somewhere else to talk. */
export interface Surroundings extends ClientOptions {
  storage?: Kept | undefined;
}

/**
 * A pair the sender opened and left empty is not a pair. Exported because the
 * screen has to ask the same question to know whether there is anything to send,
 * and two spellings of it would let a Create link button be live over an envelope
 * this refuses to seal.
 */
export function pairIsFilled(pair: {
  password: string;
  username: string;
}): boolean {
  return pair.username.trim() !== "" || pair.password.trim() !== "";
}

/**
 * What the envelope actually carries. An empty note is not a note, and the note is
 * carried exactly as typed: trailing whitespace can be part of a secret, so nothing
 * here trims what it sends.
 */
function partsOf(draft: Draft) {
  const pair = draft.credentials;

  return {
    credentials: pair && pairIsFilled(pair) ? pair : undefined,
    note: draft.note?.trim() === "" ? undefined : draft.note,
  };
}

/** Every part joined, because the cap is on all of them together. */
function textBytes(draft: Draft): number {
  const pair = draft.credentials;
  const written = [draft.note, pair?.username, pair?.password].join("");

  return SCAFFOLDING_BYTES + utf8.encode(written).length;
}

/** The cap the instance named, or this browser's own when it named none. */
function limitFrom(said: unknown): number {
  if (typeof said === "object" && said !== null && "limit" in said) {
    const { limit } = said;
    if (typeof limit === "number") {
      return limit;
    }
  }

  return MAX_ENVELOPE_BYTES;
}

function browserMemory(): Kept | null {
  try {
    return window.localStorage;
  } catch {
    // Storage can be switched off entirely. A browser that cannot remember must
    // still be able to send.
    return null;
  }
}

export async function sealAndSend(
  draft: Draft,
  around: Surroundings = {}
): Promise<SecretLink> {
  if (textBytes(draft) > MAX_ENVELOPE_BYTES) {
    throw new SendFailedError("too-big", { limit: MAX_ENVELOPE_BYTES });
  }

  const origin = around.origin ?? window.location.origin;
  const post = apiClient(around).api.secrets.$post;
  const storage = around.storage ?? browserMemory();

  async function attempt(left: number): Promise<SecretLink> {
    const sealed = await sealEnvelope(partsOf(draft), draft.password);
    const { id } = sealed.stored;

    let response: Awaited<ReturnType<Post>>;
    try {
      response = await post({
        json: { envelope: sealed.stored.envelope, expiry: draft.expiry, id },
      });
    } catch (error) {
      // Nothing answered: offline, a hung proxy, a blocked request. The cause is
      // carried because a failed fetch knows only the url it could not reach,
      // and the secret is in the body.
      throw new SendFailedError("unreachable", { cause: error });
    }

    if (response.status === CONFLICT) {
      if (left <= 1) {
        throw new SendFailedError("refused");
      }
      return await attempt(left - 1);
    }

    if (response.status === TOO_LARGE) {
      const said: unknown = await response.json().catch(() => null);
      throw new SendFailedError("too-big", { limit: limitFrom(said) });
    }

    if (response.status !== CREATED) {
      throw new SendFailedError("refused");
    }

    const answer = await response.json();

    if (storage) {
      remember(
        {
          expiresAt: answer.expiresAt,
          id,
          managementToken: answer.managementToken,
        },
        storage
      );
    }

    return {
      expiresAt: answer.expiresAt,
      href: `${origin}/s/${id}#${sealed.fragmentToken}`,
      id,
      shown: `${origin.replace(SCHEME, "")}/s/${id}#${sealed.fragmentToken}`,
    };
  }

  return await attempt(SEAL_ATTEMPTS);
}

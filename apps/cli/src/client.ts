import type { AppType } from "@securesend/api";
import type { hc, InferRequestType, InferResponseType } from "hono/client";

/*
 * The four routes, over plain fetch.
 *
 * The shapes are the api's own, borrowed at compile time and never at runtime:
 * hono and the api are development dependencies here, so a route that changes
 * reddens this package's build while the published one still installs commander
 * and nothing else.
 *
 * The readers below turn an answer into those shapes by hand. That is what makes
 * the borrowing worth anything: each one returns a value typed by the api, so a
 * field added there and not read here does not compile.
 *
 * Nothing in this file logs, and no failure it raises quotes a body. A create
 * body is ciphertext, a reveal body is the whole secret, and an error message is
 * the one thing in a terminal that gets pasted into an issue.
 */

type Api = ReturnType<typeof hc<AppType>>;
type Secrets = Api["api"]["secrets"];

export type CreateBody = InferRequestType<Secrets["$post"]>["json"];
export type Expiry = CreateBody["expiry"];
export type Created = InferResponseType<Secrets["$post"], 201>;
export type SecretStatus = InferResponseType<Secrets[":id"]["$get"], 200>;
export type Revealed = InferResponseType<
  Secrets[":id"]["reveal"]["$post"],
  200
>;
type BurnBody = InferRequestType<Secrets[":id"]["burn"]["$post"]>["json"];

/** Long enough for a slow phone tether, short enough to fail rather than hang. */
const TIMEOUT_MS = 60_000;

/** What an instance asks for when it refuses for pace and says no number. */
const WAIT_IF_UNSAID = 60;

const OK = 200;
const CREATED = 201;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const GONE = 410;
const TOO_LARGE = 413;
const TOO_MANY = 429;

interface Answer {
  body: unknown;
  status: number;
}

interface Call {
  body?: unknown;
  method: "GET" | "POST";
  origin: string;
  path: string;
}

async function ask(call: Call): Promise<Answer> {
  const init: RequestInit = {
    method: call.method,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...(call.body !== undefined && {
      body: JSON.stringify(call.body),
      headers: { "content-type": "application/json" },
    }),
  };

  let response: Response;
  try {
    response = await fetch(`${call.origin}/api${call.path}`, init);
  } catch (error) {
    /* The cause is the fetch's own, which knows the address it could not reach
     * and nothing else: no request this client makes carries a key. */
    throw new Error(`could not reach ${call.origin}`, { cause: error });
  }

  return {
    body: await response.json().catch(() => null),
    status: response.status,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isTextOrNothing(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

function isArrayOf<T>(
  value: unknown,
  each: (item: unknown) => item is T
): value is T[] {
  return Array.isArray(value) && value.every((item: unknown) => each(item));
}

const STATES: readonly SecretStatus["state"][] = [
  "sealed",
  "used",
  "burned",
  "expired",
];

function isState(value: unknown): value is SecretStatus["state"] {
  return typeof value === "string" && STATES.some((state) => state === value);
}

/** One sentence for every answer that is not the shape this version reads. */
function unreadable(): Error {
  return new Error(
    "that instance answered with something this version cannot read"
  );
}

function readStatus(body: unknown): SecretStatus {
  if (!isRecord(body)) {
    throw unreadable();
  }

  const { burnedAt, burnReason, createdAt, expiresAt, id, state, usedAt } =
    body;

  if (
    !(
      isTextOrNothing(burnedAt) &&
      isTextOrNothing(burnReason) &&
      isText(createdAt) &&
      isText(expiresAt) &&
      isText(id) &&
      isState(state) &&
      isTextOrNothing(usedAt)
    )
  ) {
    throw unreadable();
  }

  return { burnedAt, burnReason, createdAt, expiresAt, id, state, usedAt };
}

function readCreated(body: unknown): Created {
  if (!isRecord(body)) {
    throw unreadable();
  }

  const { expiresAt, id, managementToken } = body;

  if (!(isText(expiresAt) && isText(id) && isText(managementToken))) {
    throw unreadable();
  }

  return { expiresAt, id, managementToken };
}

function isCiphertext(value: unknown): value is Revealed["envelope"] {
  if (!isRecord(value)) {
    return false;
  }

  const { ciphertext, iv } = value;

  return isText(ciphertext) && isText(iv);
}

function isAttachment(
  value: unknown
): value is Revealed["attachments"][number] {
  if (!isRecord(value)) {
    return false;
  }

  const { index } = value;

  return isCiphertext(value) && isNumber(index);
}

function readRevealed(body: unknown): Revealed {
  if (!isRecord(body)) {
    throw unreadable();
  }

  const { attachments, envelope, id } = body;

  if (
    !(
      isArrayOf(attachments, isAttachment) &&
      isCiphertext(envelope) &&
      isText(id)
    )
  ) {
    throw unreadable();
  }

  return { attachments, envelope, id };
}

/** Whole seconds the instance asked to be left alone for, when it said. */
function waitOf(body: unknown): number {
  if (!isRecord(body)) {
    return WAIT_IF_UNSAID;
  }

  const { retryAfter } = body;

  return isNumber(retryAfter) ? retryAfter : WAIT_IF_UNSAID;
}

/**
 * Why nothing happened, in a sentence a terminal can print. It reads only the
 * one number an instance tells a stranger, because the rest of any of these
 * bodies is either ciphertext or nothing at all.
 */
function refused(origin: string, answer: Answer): Error {
  switch (answer.status) {
    case TOO_MANY:
      return new Error(
        `${origin} asked for a slower pace: try again in ${waitOf(answer.body)} seconds`
      );
    case NOT_FOUND:
      return new Error(`there is nothing at that link on ${origin}`);
    case FORBIDDEN:
      return new Error("that token does not manage this secret");
    case TOO_LARGE:
      return new Error(`that secret is larger than ${origin} accepts`);
    case BAD_REQUEST:
      return new Error(`${origin} would not take that request`);
    default:
      return new Error(`${origin} answered ${answer.status}`);
  }
}

/**
 * Stores one sealed envelope. Answers null when the id is taken, which is the
 * caller's cue to seal again: nothing has been shared, so a fresh id and a fresh
 * key cost the sender nothing.
 */
export async function createSecret(
  origin: string,
  body: CreateBody
): Promise<Created | null> {
  const answer = await ask({ body, method: "POST", origin, path: "/secrets" });

  if (answer.status === CONFLICT) {
    return null;
  }
  if (answer.status !== CREATED) {
    throw refused(origin, answer);
  }

  return readCreated(answer.body);
}

/** What became of a secret. This one touches nothing. */
export async function statusOf(
  origin: string,
  id: string
): Promise<SecretStatus> {
  const answer = await ask({
    method: "GET",
    origin,
    path: `/secrets/${id}`,
  });

  if (answer.status !== OK) {
    throw refused(origin, answer);
  }

  return readStatus(answer.body);
}

export type Reveal =
  | { secret: Revealed; status: "open" }
  | { state: SecretStatus; status: "gone" };

/**
 * The one destructive read. Exactly one caller ever gets the ciphertext, and the
 * instance forgets it in the same transaction, so what comes back is from here on
 * the only copy of this secret anywhere.
 */
export async function revealSecret(
  origin: string,
  id: string
): Promise<Reveal> {
  const answer = await ask({
    method: "POST",
    origin,
    path: `/secrets/${id}/reveal`,
  });

  if (answer.status === GONE) {
    return { state: readStatus(answer.body), status: "gone" };
  }
  if (answer.status !== OK) {
    throw refused(origin, answer);
  }

  return { secret: readRevealed(answer.body), status: "open" };
}

export interface Burn {
  state: SecretStatus;
  status: "burned" | "gone";
}

/** Destroys a sealed secret early. Pressing it twice is the same as once. */
export async function burnSecret(
  origin: string,
  id: string,
  managementToken: string
): Promise<Burn> {
  const body: BurnBody = { managementToken };
  const answer = await ask({
    body,
    method: "POST",
    origin,
    path: `/secrets/${id}/burn`,
  });

  /* Not a refusal: the secret died another way first, and the sender is owed
   * which way rather than an error about their token. */
  if (answer.status === CONFLICT) {
    return { state: readStatus(answer.body), status: "gone" };
  }
  if (answer.status !== OK) {
    throw refused(origin, answer);
  }

  return { state: readStatus(answer.body), status: "burned" };
}

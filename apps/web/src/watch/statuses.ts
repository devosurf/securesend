import { apiClient, type ClientOptions } from "../api/client";
import type { SentSecret } from "../compose/remember";
import { since, until } from "../lib/timing";

/*
 * What became of the secrets this device remembers.
 *
 * There is no account behind this, so the whole relationship is an id and a management
 * token in one browser's storage. That is what lets the homepage show a history the
 * instance never holds, and it is also the constraint that shapes this module: two
 * things must never leave here.
 *
 * The key, because it was never here to begin with. What a row shows is the link without
 * the part that opens it, which is why there is no copy button on a row and no resend: a
 * Copy that handed over a link that cannot decrypt would be the worst lie this product
 * could tell.
 *
 * And the management token, except to the one route that needs it. A status lookup is
 * public and asks by id alone. The token is authority over a secret's life, so it goes
 * to the burn and nowhere else, not even to a lookup that would happily ignore it.
 *
 * Every phrase a row wears is made here rather than in the screen, because the status
 * and the words about it have to agree: a row badged Sealed beside "never used" would be
 * two different answers on one line.
 */

const OK = 200;
const NOT_FOUND = 404;
const SCHEME = /^https?:\/\//;

/** The four a secret can be in, and the words for each. */
export type Kind = "sealed" | "used" | "burned" | "expired";

export interface Watched {
  id: string;
  /** The link without its key: `securesend.dev/s/7hK2mQ`. Never copyable. */
  shown: string;
  status: Kind;
  /** The one time fact beside the badge. "21 hours left", "by you, just now". */
  timing: string;
}

export type Burned =
  /** The instance answered, and this is what the secret is now. */
  | { status: "answered"; watched: Watched }
  /** The instance has nothing at that id, so this device's row is out of date. */
  | { status: "forgotten" }
  /** It did not go through, and nothing was destroyed. */
  | { status: "refused" };

interface Answer {
  burnedAt: string | null;
  createdAt: string;
  expiresAt: string;
  id: string;
  state: string;
  usedAt: string | null;
}

const KINDS: readonly Kind[] = ["sealed", "used", "burned", "expired"];

function isAnswer(value: unknown): value is Answer {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { expiresAt, id, state } = value as Record<string, unknown>;

  return (
    typeof id === "string" &&
    typeof state === "string" &&
    typeof expiresAt === "string"
  );
}

/**
 * What a row says beside its badge.
 *
 * Sealed is the only one that counts down, because it is the only one with anything
 * left to happen. Used says how long ago somebody spent it and never who. Burned names
 * the sender, because in v0 the sender is the only one who can. Expired says "never
 * used" rather than a time, because the useful fact about an expiry is not when the
 * clock ran out, it is that nobody read what was inside.
 */
function timingOf(answer: Answer, status: Kind, now: number): string {
  if (status === "sealed") {
    return `${until(answer.expiresAt, now)} left`;
  }
  if (status === "used") {
    return answer.usedAt === null ? "already used" : since(answer.usedAt, now);
  }
  if (status === "burned") {
    return answer.burnedAt === null
      ? "by you"
      : `by you, ${since(answer.burnedAt, now)}`;
  }

  return "never used";
}

function watchedFrom(
  answer: Answer,
  host: string,
  now: number
): Watched | null {
  const status = KINDS.find((kind) => kind === answer.state);

  /* A state this build has never heard of means a newer instance. A row is a claim
   * about somebody's secret, so the honest thing is to show no row rather than a row
   * whose badge is a guess. */
  return status
    ? {
        id: answer.id,
        shown: `${host}/s/${answer.id}`,
        status,
        timing: timingOf(answer, status, now),
      }
    : null;
}

/**
 * A row for the secret this device has just made, from what the receipt already knows.
 *
 * The receipt can say this without asking anybody: it holds the id and the expiry, and
 * the secret is sealed because it was made a moment ago. What it must not carry into the
 * dialog is the key, so the link is cut at its hash on the way through.
 */
export function watchedNow(
  link: { expiresAt: string; id: string; shown: string },
  now = Date.now()
): Watched {
  return {
    id: link.id,
    shown: link.shown.split("#")[0] ?? link.shown,
    status: "sealed",
    timing: `${until(link.expiresAt, now)} left`,
  };
}

function hostOf(around: ClientOptions): string {
  const origin = around.origin ?? window.location.origin;

  return origin.replace(SCHEME, "");
}

/**
 * Asks the instance about every id this browser remembers, in one request, and never
 * consumes anything: this is the same public lookup a preview bot lands on.
 *
 * Ids the instance has nothing for come back absent, which is what a row a week past its
 * expiry looks like from here. They are simply not shown, and the sentence under the
 * panel says the forgetting is how the product works.
 */
export async function statusesOf(
  remembered: readonly SentSecret[],
  around: ClientOptions = {},
  now = Date.now()
): Promise<Watched[]> {
  if (remembered.length === 0) {
    return [];
  }

  const ask = apiClient(around).api.secrets.statuses.$post;
  const host = hostOf(around);

  let response: Awaited<ReturnType<typeof ask>>;
  try {
    response = await ask({ json: { ids: remembered.map((held) => held.id) } });
  } catch {
    // Nothing answered. The rows the sender is already looking at stay as they are,
    // which is what the freshness line under them is for.
    return [];
  }

  if (response.status !== OK) {
    return [];
  }

  const said: unknown = await response.json().catch(() => null);
  if (typeof said !== "object" || said === null || !("secrets" in said)) {
    return [];
  }

  const { secrets } = said;
  if (!Array.isArray(secrets)) {
    return [];
  }

  return secrets
    .filter(isAnswer)
    .flatMap((answer) => watchedFrom(answer, host, now) ?? []);
}

/**
 * Burns one secret, with the token this browser kept at create.
 *
 * The answer is whatever the secret is now rather than a yes or a no, because a burn can
 * lose a race: somebody may have read it a second earlier, or its clock may have run out
 * first. Either way the sender's row takes what came back, and neither is a failure the
 * page has to apologise for.
 */
export async function burnOne(
  secret: SentSecret,
  around: ClientOptions = {},
  now = Date.now()
): Promise<Burned> {
  const ask = apiClient(around).api.secrets[":id"].burn.$post;

  let response: Awaited<ReturnType<typeof ask>>;
  try {
    response = await ask({
      json: { managementToken: secret.managementToken },
      param: { id: secret.id },
    });
  } catch {
    return { status: "refused" };
  }

  if (response.status === NOT_FOUND) {
    return { status: "forgotten" };
  }

  const said: unknown = await response.json().catch(() => null);
  if (!isAnswer(said)) {
    return { status: "refused" };
  }

  const watched = watchedFrom(said, hostOf(around), now);

  return watched ? { status: "answered", watched } : { status: "refused" };
}

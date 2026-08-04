import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { env } from "../env";
import { type Bucket, tokenBucket } from "./bucket";

/*
 * What each route is willing to be called at, and what it says when it will not.
 *
 * There is no CAPTCHA and there is no third-party script anywhere in this product, so
 * abuse control is structural instead: one-time links, a 72 hour ceiling, size caps,
 * and these. What is left for a limiter to do is bound the cost of volume, and that
 * happens in two places at once.
 *
 * Per caller, keyed on their address, which bounds one machine. And once more across
 * the whole instance on create, which is the watermark, because the per-caller key is
 * something the caller chooses and a botnet has as many real addresses as it has
 * machines. The two are checked in that order: a caller hammering their own bucket is
 * refused by it and never reaches the shared one, so one machine cannot spend the
 * instance's whole allowance and lock out everybody else.
 *
 * Create, reveal and status, and not burn. A burn needs the 256-bit management token
 * this instance only ever handed to one browser, so the cheapest thing a stranger can
 * do to that route is one indexed lookup and a 403. Every other route is open by
 * design, because a recipient has no account to bring.
 *
 * What a refusal says is bounded by what is true. It names the pace and never the
 * address, it says whether the caller or the instance is the one at its limit, because
 * those have different answers, and it carries how long the wait actually is rather
 * than a guess the browser would have to invent.
 */

const TOO_MANY = 429;

/** Which limit a caller met, since "slow down" and "not you" are different facts. */
export type Scope = "ip" | "instance";

const REFUSED: Record<Scope, string> = {
  instance: "this instance is at its limit for now",
  ip: "that is faster than this instance takes from one place",
};

/**
 * Every bucket this process holds, which is every trace of a caller it keeps at all.
 *
 * Named as a group because two things have to reach all of them: the janitor's pass,
 * which is what makes "nothing keyed to an IP lives past 24 hours" true, and a test,
 * which needs the process to start each one as if nobody had ever called.
 */
export const buckets = {
  creates: tokenBucket(env.createPace),
  instanceCreates: tokenBucket(env.instanceCreatePace),
  reveals: tokenBucket(env.revealPace),
  statuses: tokenBucket(env.statusPace),
} as const;

const everyBucket = Object.values(buckets);

/** Drops what has refilled and what has aged out. The janitor's half of the claim. */
export function forgetIdleCallers(): void {
  for (const bucket of everyBucket) {
    bucket.forget();
  }
}

/** Everyone, immediately. Only a test wants this. */
export function forgetEveryone(): void {
  for (const bucket of everyBucket) {
    bucket.clear();
  }
}

/** The one key that is not a caller's address: the instance itself, counted as one. */
const THE_INSTANCE = "instance";

/**
 * Callers with no address at all, which is one shared bucket rather than none.
 *
 * It happens when the api is driven fetch-style with no socket under it, which is how
 * the tests drive it, and it would happen on a socket type Node reports nothing for.
 * Sharing one bucket is the safe way round: the alternative is an unlimited route for
 * anybody who can arrive without an address.
 */
const NO_ADDRESS = "unknown";

function addressOf(c: Context): string {
  const named = env.clientIpHeader;

  if (named) {
    /* Last rather than first. A forwarding header is a list the caller can start and
     * each proxy appends to, so the trustworthy end is the one nearest this process. */
    const said = c.req.header(named)?.split(",").at(-1)?.trim();
    if (said) {
      return said;
    }
  }

  try {
    return getConnInfo(c).remote.address ?? NO_ADDRESS;
  } catch {
    // No socket under this request. Not an error, and not something to log: it is
    // what a test looks like from in here.
    return NO_ADDRESS;
  }
}

function refuse(c: Context, scope: Scope, retryAfter: number) {
  c.header("Retry-After", String(retryAfter));

  return c.json({ error: REFUSED[scope], retryAfter, scope }, TOO_MANY);
}

/** One limit a route is held to: a bucket, what it counts under, and what to say. */
interface Limit {
  bucket: Bucket;
  keyOf: (c: Context) => string;
  scope: Scope;
}

/** One caller's pace, counted under their address. */
export function perCaller(bucket: Bucket): Limit {
  return { bucket, keyOf: addressOf, scope: "ip" };
}

/** The whole instance's pace, counted as one caller. */
export function perInstance(bucket: Bucket): Limit {
  return { bucket, keyOf: () => THE_INSTANCE, scope: "instance" };
}

/**
 * Holds a route to every limit given, in order, and charges nothing until they all
 * allow it.
 *
 * The two passes are the point. Charging as it went would mean a create the watermark
 * is about to refuse still costs the sender a token of their own, so a sender who
 * retries into a full instance ten times ends up being told they are going faster than
 * this instance takes from one place, about ten creates that never happened. Their own
 * pace and the instance's are different facts and the whole reason a refusal names
 * which one it is; spending on a refusal would make that name a lie within a minute.
 *
 * Order still matters for what a refusal says: the caller's own limit is asked first,
 * because it is the one they can act on, and a caller hammering their own bucket is
 * refused there and never reaches the shared one.
 */
export function paced(...limits: readonly Limit[]) {
  return createMiddleware(async (c, next) => {
    const asked = limits.map((limit) => ({ ...limit, key: limit.keyOf(c) }));

    for (const limit of asked) {
      const room = limit.bucket.check(limit.key);
      if (!room.ok) {
        return refuse(c, limit.scope, room.retryAfter);
      }
    }

    for (const limit of asked) {
      limit.bucket.take(limit.key);
    }

    return await next();
  });
}

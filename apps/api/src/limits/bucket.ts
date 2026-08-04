/*
 * A token bucket, and the whole of what this product remembers about who calls it.
 *
 * It is in memory, in this process, deliberately. A shared counter would mean Redis,
 * and one Node process plus Postgres is the deployment promise, so a self-hoster
 * running two containers gets two limiters and the docs say so rather than a queue
 * appearing in the stack to avoid admitting it.
 *
 * A bucket holds a number of tokens and refills at a fixed rate. Capacity is what a
 * caller may spend back to back, the refill is what they may keep spending, and the
 * two together are the only honest way to say "fast" about a request: a rate alone
 * refuses somebody sending three secrets in one minute, and a count alone lets one
 * caller spend a day's worth in a second.
 *
 * Nothing here is ever logged, and the key is a caller's address. The security page
 * says anything keyed to an IP expires within 24 hours, so the forgetting below is
 * that claim rather than housekeeping, and it is written to be read against it.
 *
 * The address is not hashed, and that is deliberate rather than lazy. Hashing all
 * four billion IPv4 addresses takes seconds, so a hash here would protect nothing and
 * would let this file imply otherwise. What makes the claim true is that the key lives
 * in memory for minutes, never reaches disk, and is never in the same place as a
 * secret's id.
 */

/** The ceiling every entry lives under, whatever it is doing. */
export const A_DAY = 24 * 60 * 60 * 1000;

/**
 * How many callers one bucket holds before the longest-held start going.
 *
 * A limiter keyed on something the caller picks is a map somebody else decides the
 * size of, and a botnet is many real addresses rather than one spoofed one. Past this
 * the oldest entries go, which loses their limits: bounding a flood that wide is the
 * global watermark's job, and a process killed by its own limiter bounds nothing.
 */
export const MOST_CALLERS = 20_000;

const A_SECOND = 1000;

export interface Pace {
  /** How many a caller may spend back to back. */
  capacity: number;
  /** How long one token takes to come back. */
  refillMs: number;
}

export type Taken =
  | { ok: true }
  /** Whole seconds until the next token, rounded up and never zero. */
  | { ok: false; retryAfter: number };

interface Held {
  /** When the count below was last worked out. */
  at: number;
  /** When this entry was made, which is what the day's ceiling is measured from. */
  bornAt: number;
  /** Fractional on purpose: a part token is what makes a wait answerable in seconds. */
  tokens: number;
}

export interface Bucket {
  /**
   * Whether a token is there, without taking it.
   *
   * A route behind more than one limit needs this: charging a caller for a request
   * a later limit is about to refuse would leave them paying for work nobody did.
   */
  check: (key: string, now?: number) => Taken;
  /** Everything, now. Only a test needs this. */
  clear: () => void;
  /** Drops every entry that has refilled, and every entry a day old. */
  forget: (now?: number) => void;
  size: () => number;
  take: (key: string, now?: number) => Taken;
}

export function tokenBucket({ capacity, refillMs }: Pace): Bucket {
  const held = new Map<string, Held>();

  function filled(one: Held, now: number): number {
    return Math.min(capacity, one.tokens + (now - one.at) / refillMs);
  }

  /* Refilled means indistinguishable from a caller nobody has ever seen, so keeping
   * the entry would be keeping an address for no reason at all. */
  function spent(one: Held, now: number): boolean {
    return now - one.bornAt >= A_DAY || filled(one, now) >= capacity;
  }

  function forget(now = Date.now()): void {
    for (const [key, one] of held) {
      if (spent(one, now)) {
        held.delete(key);
      }
    }
  }

  /* Insertion order, which a Map keeps, so the longest-held go first. */
  function trim(now: number): void {
    if (held.size <= MOST_CALLERS) {
      return;
    }

    forget(now);

    for (const key of held.keys()) {
      if (held.size <= MOST_CALLERS) {
        return;
      }
      held.delete(key);
    }
  }

  function waitFor(tokens: number): number {
    return Math.ceil(((1 - tokens) * refillMs) / A_SECOND);
  }

  /**
   * What a caller has, or nothing when this has never met them.
   *
   * An entry a day past its birth reads as absent, which is where the ceiling on how
   * long an address is kept actually happens: nothing reads one that old, and the next
   * take writes over it.
   */
  function heldFor(key: string, now: number): Held | undefined {
    const one = held.get(key);

    return one && now - one.bornAt < A_DAY ? one : undefined;
  }

  function check(key: string, now = Date.now()): Taken {
    const one = heldFor(key, now);
    if (!one) {
      return { ok: true };
    }

    const tokens = filled(one, now);

    return tokens < 1
      ? { ok: false, retryAfter: waitFor(tokens) }
      : { ok: true };
  }

  function take(key: string, now = Date.now()): Taken {
    const one = heldFor(key, now);

    if (!one) {
      held.set(key, { at: now, bornAt: now, tokens: capacity - 1 });
      trim(now);
      return { ok: true };
    }

    const tokens = filled(one, now);

    /* A refusal writes nothing, which is two things at once. A caller who keeps
     * pressing cannot hold their own bucket empty, because the count is always
     * measured from their last successful take rather than their last attempt. And
     * the arithmetic stays exact: rewriting a fractional count on every press would
     * accumulate float error, so nine refusals could cost a caller the tenth token
     * they had actually earned. */
    if (tokens < 1) {
      return { ok: false, retryAfter: waitFor(tokens) };
    }

    one.at = now;
    one.tokens = tokens - 1;
    return { ok: true };
  }

  return {
    check,
    clear: () => held.clear(),
    forget,
    size: () => held.size,
    take,
  };
}

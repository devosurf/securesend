import { describe, expect, it } from "vitest";
import { A_DAY, MOST_CALLERS, tokenBucket } from "./bucket";

/*
 * The bucket, driven on a clock the test holds.
 *
 * Everything here passes `now` rather than waiting, because the two properties worth
 * pinning are both about elapsed time: a caller gets tokens back at the rate they
 * were promised, and nothing keyed to a caller outlives a day. Neither is testable
 * against a real clock in under a day, and a fake timer would be testing the fake.
 */

const PACE = { capacity: 3, refillMs: 1000 };

/** Presses until the bucket says no, and answers how many got through. */
function hammer(
  bucket: ReturnType<typeof tokenBucket>,
  key: string,
  now: number
): number {
  let through = 0;
  while (bucket.take(key, now).ok) {
    through += 1;
    if (through > MOST_CALLERS) {
      throw new Error("this bucket refuses nothing");
    }
  }
  return through;
}

describe("a token bucket", () => {
  it("takes a caller's whole burst back to back, then refuses", () => {
    const bucket = tokenBucket(PACE);

    expect(hammer(bucket, "one", 0)).toBe(PACE.capacity);
  });

  it("counts each caller on their own", () => {
    const bucket = tokenBucket(PACE);

    hammer(bucket, "one", 0);

    expect(bucket.take("other", 0).ok).toBe(true);
  });

  it("hands back one token per refill, and no more", () => {
    const bucket = tokenBucket(PACE);
    hammer(bucket, "one", 0);

    expect(bucket.take("one", PACE.refillMs).ok).toBe(true);
    expect(bucket.take("one", PACE.refillMs).ok).toBe(false);
  });

  it("never hands back more than the burst, however long nobody asks", () => {
    const bucket = tokenBucket(PACE);
    hammer(bucket, "one", 0);

    expect(hammer(bucket, "one", A_DAY - 1)).toBe(PACE.capacity);
  });

  /* A caller who keeps pressing has to keep accruing, and this is the shape that
   * catches both ways of getting it wrong: a refusal that moved the refill clock
   * would hold the bucket empty for as long as somebody kept pressing, and a refusal
   * that rewrote a fractional count would lose the ninth press to float error and
   * refuse a token that had been earned. */
  it("keeps refilling a caller who is being refused", () => {
    const bucket = tokenBucket(PACE);
    hammer(bucket, "one", 0);

    for (let at = 100; at < PACE.refillMs; at += 100) {
      expect(bucket.take("one", at).ok).toBe(false);
    }

    expect(bucket.take("one", PACE.refillMs).ok).toBe(true);
  });

  it("says how many whole seconds until the next token", () => {
    const bucket = tokenBucket({ capacity: 1, refillMs: 60_000 });
    bucket.take("one", 0);

    expect(bucket.take("one", 0)).toStrictEqual({ ok: false, retryAfter: 60 });
    expect(bucket.take("one", 30_000)).toStrictEqual({
      ok: false,
      retryAfter: 30,
    });
  });

  /* Rounded up, and never to zero: "try again in no time" is the one answer a
   * refusal cannot give, because a caller who takes it literally is refused again. */
  it("rounds a part-second wait up to one", () => {
    const bucket = tokenBucket({ capacity: 1, refillMs: 1000 });
    bucket.take("one", 0);

    expect(bucket.take("one", 999)).toStrictEqual({ ok: false, retryAfter: 1 });
  });
});

/*
 * Looking without taking, which a route behind more than one limit needs.
 *
 * Charging a caller for a request a later limit is about to refuse would leave them
 * paying for work nobody did, and then being told they are going too fast about it.
 */
describe("checking a token bucket", () => {
  it("says what a take would say", () => {
    const bucket = tokenBucket({ capacity: 1, refillMs: 60_000 });
    expect(bucket.check("one", 0)).toStrictEqual({ ok: true });

    bucket.take("one", 0);

    expect(bucket.check("one", 0)).toStrictEqual({ ok: false, retryAfter: 60 });
  });

  it("takes nothing, however many times it is asked", () => {
    const bucket = tokenBucket(PACE);

    for (let asked = 0; asked < PACE.capacity * 3; asked += 1) {
      expect(bucket.check("one", 0).ok).toBe(true);
    }

    expect(hammer(bucket, "one", 0)).toBe(PACE.capacity);
  });

  it("holds nobody it has only been asked about", () => {
    const bucket = tokenBucket(PACE);

    bucket.check("one", 0);

    expect(bucket.size()).toBe(0);
  });
});

/*
 * What this forgets, which is the whole of the privacy claim on the security page:
 * anything keyed to an IP address expires within 24 hours.
 *
 * Two mechanisms, and the first does nearly all the work. A bucket that has refilled
 * is indistinguishable from a caller nobody has ever seen, so there is no reason to
 * keep it and it goes on the next pass. The day is the backstop for the caller who
 * never stops pressing, and it is what makes the claim true rather than usually true.
 */
describe("a token bucket's memory", () => {
  it("holds nobody it has not heard from", () => {
    const bucket = tokenBucket(PACE);

    expect(bucket.size()).toBe(0);
  });

  it("forgets a caller whose bucket has refilled", () => {
    const bucket = tokenBucket(PACE);
    bucket.take("one", 0);

    bucket.forget(PACE.refillMs * PACE.capacity);

    expect(bucket.size()).toBe(0);
  });

  it("keeps a caller who is still part way back", () => {
    const bucket = tokenBucket(PACE);
    hammer(bucket, "one", 0);

    bucket.forget(PACE.refillMs);

    expect(bucket.size()).toBe(1);
  });

  it("forgets a caller a day old however empty their bucket is", () => {
    const bucket = tokenBucket({ capacity: 1, refillMs: A_DAY * 2 });
    bucket.take("one", 0);
    bucket.forget(A_DAY - 1);
    expect(bucket.size()).toBe(1);

    bucket.forget(A_DAY);

    expect(bucket.size()).toBe(0);
  });

  /* The same day, seen from the other side: an entry a day old is not read, so a
   * caller who has been hammering for 25 hours is a caller this has never met. That
   * is the cost of the claim, and it is one burst a day. */
  it("treats a day-old caller as a new one", () => {
    const bucket = tokenBucket({ capacity: 1, refillMs: A_DAY * 2 });
    bucket.take("one", 0);
    expect(bucket.take("one", A_DAY - 1).ok).toBe(false);

    expect(bucket.take("one", A_DAY).ok).toBe(true);
  });

  /* A botnet is many real addresses, so the map's size is somebody else's to choose
   * unless there is a ceiling on it. Past the ceiling the longest-held go, which
   * loses their limits: bounding that flood is the global watermark's job, not this
   * one's, and a process killed by its own limiter would bound nothing at all. */
  it("holds no more callers than its ceiling", () => {
    const bucket = tokenBucket(PACE);

    for (let caller = 0; caller <= MOST_CALLERS; caller += 1) {
      bucket.take(`caller-${caller}`, 0);
    }

    expect(bucket.size()).toBeLessThanOrEqual(MOST_CALLERS);
  });

  it("clears everything at once, for a test that needs a fresh instance", () => {
    const bucket = tokenBucket(PACE);
    hammer(bucket, "one", 0);

    bucket.clear();

    expect(bucket.size()).toBe(0);
    expect(bucket.take("one", 0).ok).toBe(true);
  });
});

/*
 * The instance saying "not this fast", read once for every side of the product.
 *
 * There are no accounts and no third-party bot check anywhere here, so per-caller rate
 * limits are how abuse is bounded, which means an ordinary person will occasionally meet
 * one: an office behind a single address, somebody onboarding a whole team, a phone on
 * carrier NAT. That makes this an ordinary state rather than an error, and it gets the
 * same treatment as every other dead end in the product: say what happened, say what is
 * still true, say what to do next.
 *
 * Two things come back. How long to wait, which is the instance's number and not a guess
 * this app invented. And who is at their limit, because "you are going faster than we
 * take" and "we are full right now" have different answers and one of them is not the
 * caller's fault.
 */

export const TOO_MANY = 429;

/** Whose limit was met. Named for the mechanism, since it is one the pages describe. */
export type Scope = "ip" | "instance";

export interface Refusal {
  /** Whole seconds. Always at least one, so no copy ever says to retry immediately. */
  retryAfter: number;
  scope: Scope;
}

/**
 * What to say when the instance said nothing readable.
 *
 * A 429 can also come from a proxy in front of the instance, which knows nothing about
 * this product's shapes, so the body being unreadable is a real case rather than a
 * broken one. A minute is the create limit's own refill at the default, which makes it
 * the honest guess when there is nothing to read.
 */
const A_MINUTE = 60;

/**
 * Unreadable bodies read as the instance's own limit rather than the caller's.
 *
 * Not a coin flip: telling somebody they were going too fast when the instance was
 * simply full blames them for something that was not theirs, and the reverse only omits
 * a detail. When in doubt, the product takes the blame.
 */
const WHEN_UNSAID: Scope = "instance";

function scopeOf(said: unknown): Scope {
  if (typeof said === "object" && said !== null && "scope" in said) {
    return said.scope === "ip" ? "ip" : WHEN_UNSAID;
  }

  return WHEN_UNSAID;
}

function secondsOf(said: unknown, header: string | null): number {
  if (typeof said === "object" && said !== null && "retryAfter" in said) {
    const { retryAfter } = said;
    if (typeof retryAfter === "number" && retryAfter > 0) {
      return Math.ceil(retryAfter);
    }
  }

  // The standard header, which is what a proxy's refusal carries when nothing else does.
  const stated = Number(header);

  return Number.isInteger(stated) && stated > 0 ? stated : A_MINUTE;
}

/** Reads the whole refusal, body and header, and always answers with something sayable. */
export async function readRefusal(response: Response): Promise<Refusal> {
  const said: unknown = await response.json().catch(() => null);

  return {
    retryAfter: secondsOf(said, response.headers.get("Retry-After")),
    scope: scopeOf(said),
  };
}

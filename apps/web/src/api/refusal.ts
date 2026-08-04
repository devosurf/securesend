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

/**
 * Whose limit was met. Named for the mechanism, since it is one the pages describe.
 *
 * `unsaid` is the third because a 429 can come from a proxy in front of the instance,
 * which knows nothing about this product's shapes. Guessing either of the other two
 * there would be asserting a cause rather than omitting one.
 */
export type Scope = "ip" | "instance" | "unsaid";

export interface Refusal {
  /** Whole seconds. Always at least one, so no copy ever says to retry immediately. */
  retryAfter: number;
  scope: Scope;
}

/**
 * How long to wait when nothing said, which is a minute.
 *
 * The create limit's own refill at the default, which makes it the honest guess. It is
 * exported because both sides of the product need a number to hold before any refusal
 * has arrived, and two spellings of this one would be two different waits.
 */
export const WAIT_IF_UNSAID = 60;

function scopeOf(said: unknown): Scope {
  if (typeof said !== "object" || said === null || !("scope" in said)) {
    return "unsaid";
  }

  return said.scope === "ip" || said.scope === "instance"
    ? said.scope
    : "unsaid";
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

  return Number.isInteger(stated) && stated > 0 ? stated : WAIT_IF_UNSAID;
}

/** Reads the whole refusal, body and header, and always answers with something sayable. */
export async function readRefusal(response: Response): Promise<Refusal> {
  const said: unknown = await response.json().catch(() => null);

  return {
    retryAfter: secondsOf(said, response.headers.get("Retry-After")),
    scope: scopeOf(said),
  };
}

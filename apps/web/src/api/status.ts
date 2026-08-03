/*
 * What the instance says a secret is, read once for both sides of the product.
 *
 * The recipient's page and the sender's list ask different routes for different reasons
 * and turn the answer into different things: one picks a dead end to word, the other
 * builds a row. What they share is this shape, because the api answers a lookup, a spent
 * reveal and a burn with exactly one of it. Reading it in two places would be two
 * hand-rolled guards on the same three fields, and the day the api adds a field they
 * would drift apart quietly.
 *
 * A state this build has never heard of is not an error and not a dead secret. It means a
 * newer instance, and the honest thing is to say nothing about it rather than word a
 * tombstone from a guess, so it reads as absent here and each caller decides what absent
 * means for the screen it is drawing.
 */

/** The four the instance can report, in the precedence it derives them in. */
const STATES = ["sealed", "used", "burned", "expired"] as const;

export type SecretState = (typeof STATES)[number];

/** Timestamps, ISO, exactly as the instance recorded them. */
export interface SecretTimes {
  burnedAt: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface SecretAnswer extends SecretTimes {
  id: string;
  state: SecretState;
}

/**
 * Reads one answer, or nothing. Deliberately loose about the fields nobody uses and
 * strict about the four that word a screen.
 */
export function readAnswer(value: unknown): SecretAnswer | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { burnedAt, createdAt, expiresAt, id, state, usedAt } = value as Record<
    string,
    unknown
  >;

  if (
    typeof id !== "string" ||
    typeof createdAt !== "string" ||
    typeof expiresAt !== "string"
  ) {
    return null;
  }

  const known = STATES.find((name) => name === state);
  if (!known) {
    return null;
  }

  return {
    burnedAt: typeof burnedAt === "string" ? burnedAt : null,
    createdAt,
    expiresAt,
    id,
    state: known,
    usedAt: typeof usedAt === "string" ? usedAt : null,
  };
}

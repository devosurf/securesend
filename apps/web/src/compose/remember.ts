/*
 * What this browser keeps about what it sent.
 *
 * There are no accounts, so this is the whole of a sender's relationship with a
 * secret after the receipt: an id to ask about and the management token that lets
 * them burn it early. It lives in this browser and nowhere else, which is why the
 * homepage can show a history without the server ever holding one.
 *
 * Two things are deliberately absent. The key, so that a sender's own history can
 * never re-leak a secret: what is here is the link without the part that opens it.
 * And anything about the contents, because the browser does not keep those either
 * once the tab is closed.
 *
 * Storage can be unavailable or full, and a browser that cannot remember must
 * still be able to send. So every failure here is swallowed: the sender loses the
 * history, not the link.
 */

const KEY = "securesend.sent";

/** Past expiry. After this the tombstone is gone from the server too. */
const KEEP_DAYS = 7;

/**
 * The most rows this browser keeps, which is also the honest ceiling of an anonymous
 * list: there is no search here and no paging, so a list past this length has stopped
 * being something a sender reads and started being something they scroll. It bounds
 * the status lookup as well, which asks about every row at once.
 */
const KEEP_ROWS = 50;

const DAY_MS = 86_400_000;

/** The two halves of a browser's memory that this module needs. */
export type Kept = Pick<Storage, "getItem" | "setItem">;

/**
 * This browser's own store, or nothing at all. Storage can be switched off entirely,
 * and a browser that cannot remember must still be able to send: what such a sender
 * loses is the history, never the link.
 */
export function browserMemory(): Kept | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface SentSecret {
  /** ISO, and also what says when this row may be forgotten. */
  expiresAt: string;
  id: string;
  managementToken: string;
}

function isSentSecret(value: unknown): value is SentSecret {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { expiresAt, id, managementToken } = value as Record<string, unknown>;

  return (
    typeof expiresAt === "string" &&
    typeof id === "string" &&
    typeof managementToken === "string"
  );
}

function read(kept: Kept): SentSecret[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(kept.getItem(KEY) ?? "[]");
  } catch {
    // Whatever is under this key is not ours. Starting over loses a history;
    // throwing would lose the send.
    return [];
  }

  return Array.isArray(parsed) ? parsed.filter(isSentSecret) : [];
}

function stillWorthKeeping(secret: SentSecret, now: number): boolean {
  const expiry = Date.parse(secret.expiresAt);

  return Number.isNaN(expiry) ? false : now - expiry < KEEP_DAYS * DAY_MS;
}

/**
 * What this browser still remembers, newest first, which is the only order a
 * device-local list can honestly have: there is no name to sort by and no sort control
 * to offer.
 *
 * Rows a week past their expiry are gone, and so is anything past the ceiling. Both
 * are the forgetting the product tells senders about, and both are applied on the way
 * out as well as on the way in, so a memory written by an older build reads the same as
 * one written by this one.
 */
export function recall(kept: Kept, now = Date.now()): SentSecret[] {
  return read(kept)
    .filter((held) => stillWorthKeeping(held, now))
    .slice(0, KEEP_ROWS);
}

/**
 * Puts one secret at the front of this browser's memory, newest first.
 *
 * Rows a week past their expiry are dropped on the way through, and so is anything past
 * the ceiling. Doing it on write is what keeps a browser that sends every day from
 * carrying a year of dead ids.
 */
export function remember(secret: SentSecret, kept: Kept, now = Date.now()) {
  const rest = recall(kept, now).filter((held) => held.id !== secret.id);

  try {
    kept.setItem(KEY, JSON.stringify([secret, ...rest].slice(0, KEEP_ROWS)));
  } catch {
    // Private mode, a disabled store, or a full quota. The link is already made
    // and the sender still has it; only the history is lost.
  }
}

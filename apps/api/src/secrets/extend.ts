import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { secrets } from "../db/schema";
import { managesSecret } from "./management";
import { lookUp, type SecretStatus, statusOf } from "./state";

/*
 * Moving a sealed secret's expiry further out.
 *
 * This is the only thing a sender can do to a secret short of destroying it, and it
 * exists because of where it is pressed: the sender is back in Slack, the link is
 * already in the channel, and the person it was for has not opened it yet. Sending
 * a fresh secret instead would put a second link in the same room.
 *
 * The target is hours from creation rather than hours from now, which is what keeps
 * a ceiling a ceiling: press it twice from now and a secret walks past 72 hours one
 * press at a time. 72 is also the type, so a third target cannot arrive without
 * someone widening `ExtendTarget` and reading this. The product's create enum is
 * untouched by any of it.
 *
 * Authority is the management token, checked here exactly the way burn.ts checks it,
 * because it is the only authority in this product and this is the second thing that
 * acts on one. Nothing can ask this module to move an expiry while holding an id
 * alone.
 *
 * One statement does the work, where a burn needs a transaction for its files and
 * its counter. The conditions and the new value are evaluated against the row under
 * one lock, so a reveal racing this either got there first, in which case the
 * conditions no longer match and nothing moves, or it waits and finds a row whose
 * clock changed and whose envelope it still holds.
 */

/** The two an extension can move an expiry to, in hours from creation. */
export type ExtendTarget = 48 | 72;

export interface Extending {
  id: string;
  managementToken: string;
  target: ExtendTarget;
}

/** Where this target puts the clock, measured from the row's own creation. */
function movedTo(target: ExtendTarget) {
  return sql`${secrets.createdAt} + make_interval(hours => ${target})`;
}

/**
 * The row as it now stands, or null when this token does not manage a secret at
 * that id.
 *
 * Null covers a wrong token and an id that was never here, on purpose: telling those
 * two apart would let whoever holds a button learn which ids exist.
 *
 * Everything else comes back as a status rather than as an error, because the status
 * already says what happened. A used, burned or expired row is refused and names
 * itself, the way burn.ts lets the row say which death it died, and an extension
 * that would have shortened the clock leaves `expiresAt` exactly where it was.
 */
export async function extendSecret({
  id,
  managementToken,
  target,
}: Extending): Promise<SecretStatus | null> {
  const [held] = await db
    .select({ hash: secrets.managementTokenHash })
    .from(secrets)
    .where(eq(secrets.id, id));

  if (!(held && managesSecret(managementToken, held.hash))) {
    return null;
  }

  const [claimed] = await db
    .update(secrets)
    .set({ expiresAt: movedTo(target) })
    .where(
      and(
        eq(secrets.id, id),
        isNull(secrets.usedAt),
        isNull(secrets.burnedAt),
        gt(secrets.expiresAt, sql`now()`),
        /* An extension is only an extension if it is longer than what is already
         * set. Pressing 48 on a secret that is at 72 is a stale button, not an
         * instruction to take a day off its clock. */
        lt(secrets.expiresAt, movedTo(target))
      )
    )
    .returning({
      burnedAt: secrets.burnedAt,
      burnReason: secrets.burnReason,
      createdAt: secrets.createdAt,
      expired: sql<boolean>`${secrets.expiresAt} <= now()`,
      expiresAt: secrets.expiresAt,
      id: secrets.id,
      usedAt: secrets.usedAt,
    });

  // Nothing matched, so the row is not sealed any more or it is already at least
  // this long. Either way the truth about it is what the caller is owed.
  return claimed ? statusOf(claimed) : await lookUp(id);
}

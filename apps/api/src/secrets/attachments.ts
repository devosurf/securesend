import { bytesToBase64url } from "@securesend/crypto/base64url";
import { eq } from "drizzle-orm";
import type { db } from "../db/client";
import { attachments } from "../db/schema";

/*
 * Taking a secret's files, which is the only thing that ever happens to them.
 *
 * There is no read here and there cannot be one. A file's bytes leave this
 * instance exactly once, in the same statement that destroys them, so there is no
 * instant in which an attachment has been handed out and still sits in the table.
 * The reveal keeps what comes back and the burn drops it; both are the same act
 * as far as these rows are concerned.
 *
 * They are deleted rather than emptied, which is where an attachment differs from
 * the envelope. What death leaves is a tombstone of status and timestamps, and a
 * row standing with its ciphertext scrubbed would still tell the next reader how
 * many files there had been and roughly how big.
 */

/** base64url, which is how a ciphertext travels and how the client took it in. */
export interface ReleasedAttachment {
  ciphertext: string;
  index: number;
  iv: string;
}

/** The half of a database handle this needs, so a transaction fits it as well. */
type Taking = Pick<typeof db, "delete">;

/**
 * Every attachment a secret holds, released and gone by the time this returns.
 *
 * It has to run inside the transaction that claimed the secrets row, because that
 * claim is what decides who may have these. Ordering is done here rather than in
 * sql: a delete makes no promise about the order of what it returns, and the
 * client matches each ciphertext to a name by its index.
 */
export async function takeAttachments(
  on: Taking,
  secretId: string
): Promise<ReleasedAttachment[]> {
  const taken = await on
    .delete(attachments)
    .where(eq(attachments.secretId, secretId))
    .returning({
      ciphertext: attachments.ciphertext,
      index: attachments.index,
      iv: attachments.iv,
    });

  return taken
    .map((row) => ({
      ciphertext: bytesToBase64url(row.ciphertext),
      index: row.index,
      iv: bytesToBase64url(row.iv),
    }))
    .sort((one, other) => one.index - other.index);
}

/**
 * The same death without the release, for a burn: nobody is owed what was in
 * these, so nothing comes back.
 *
 * It is a separate statement rather than a discarded return because the
 * difference is ten megabytes. Asking for the rows would ship every blob into
 * this process and base64 it on the way, a third bigger again, to throw it away.
 */
export async function scrubAttachments(
  on: Taking,
  secretId: string
): Promise<void> {
  await on.delete(attachments).where(eq(attachments.secretId, secretId));
}

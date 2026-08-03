import { zValidator } from "@hono/zod-validator";
import { isSecretId } from "@securesend/crypto/ids";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client";
import { countOne } from "../db/counters";
import { secrets } from "../db/schema";
import { scrubAttachments } from "./attachments";
import { MANAGEMENT_TOKEN_LENGTH, managesSecret } from "./management";
import { lookUp, statusOf } from "./state";

/*
 * Burning a secret before anybody reads it.
 *
 * There is no account behind this. The whole of a sender's authority is the
 * management token their own browser kept at create, and the row holds only a hash
 * of it, so this route can tell that a caller has it and can learn nothing else.
 * Two different secrets are two different tokens: holding one proves nothing about
 * the other.
 *
 * Pressing it twice has to be safe. The likeliest moment anybody burns a secret is
 * the few seconds after pasting a link into the wrong window, which is exactly when
 * a second press happens, so a burn that already happened answers the same way
 * rather than complaining. What it will not do is claim a row that died some other
 * way: recording a burn over a used or expired secret would tell the next visitor
 * "the sender burned it" about something that had already gone on its own.
 *
 * The reason is stored because the recipient's dead end is worded from it. Only ever
 * the sender in v0, and the recipient is told exactly that.
 */

const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;

const BY_THE_SENDER = "sender";

const burnBody = z.strictObject({
  managementToken: z.string().length(MANAGEMENT_TOKEN_LENGTH),
});

export const burn = new Hono().post(
  "/:id/burn",
  zValidator("json", burnBody, (result, c) =>
    result.success
      ? undefined
      : c.json({ error: "that is not a management token" }, BAD_REQUEST)
  ),
  async (c) => {
    const id = c.req.param("id");
    const { managementToken } = c.req.valid("json");

    if (!isSecretId(id)) {
      return c.json({ error: "there is nothing at this link" }, NOT_FOUND);
    }

    const [held] = await db
      .select({ hash: secrets.managementTokenHash })
      .from(secrets)
      .where(eq(secrets.id, id));

    if (!held) {
      return c.json({ error: "there is nothing at this link" }, NOT_FOUND);
    }
    if (!managesSecret(managementToken, held.hash)) {
      return c.json(
        { error: "that token does not manage this secret" },
        FORBIDDEN
      );
    }

    /* One transaction takes the row if it is still sealed. A reveal racing this
     * holds the same lock, so one of the two wins outright and the loser reads the
     * row as the other left it. */
    const burned = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(secrets)
        .set({
          burnedAt: sql`now()`,
          burnReason: BY_THE_SENDER,
          envelope: null,
          envelopeIv: null,
        })
        .where(
          and(
            eq(secrets.id, id),
            isNull(secrets.usedAt),
            isNull(secrets.burnedAt),
            gt(secrets.expiresAt, sql`now()`)
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

      if (!claimed) {
        return null;
      }

      /* Only once the row is this sender's to kill. Files left standing under a
       * row already saying the secret was destroyed would be the larger half of it
       * still sitting on the instance. */
      await scrubAttachments(tx, id);

      await countOne(tx, "burns");

      return statusOf(claimed);
    });

    if (burned) {
      return c.json(burned);
    }

    // Nothing was claimed: either this sender has already burned it, or somebody
    // read it, or its clock ran out. The row says which, and the sender's list
    // takes whatever came back.
    const found = await lookUp(id);

    if (!found) {
      return c.json({ error: "there is nothing at this link" }, NOT_FOUND);
    }

    return found.state === "burned" ? c.json(found) : c.json(found, CONFLICT);
  }
);

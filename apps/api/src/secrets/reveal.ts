import { bytesToBase64url } from "@securesend/crypto/base64url";
import { isSecretId } from "@securesend/crypto/ids";
import { and, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { db } from "../db/client";
import { countOne } from "../db/counters";
import { secrets } from "../db/schema";
import { lookUp } from "./state";

/*
 * The reveal: the one action in this product that destroys something.
 *
 * It is a claim, not a read followed by a write. One transaction takes a row that
 * is still live, hands back what it holds, and scrubs it before committing, so
 * there is no instant in which a secret has been released and still sits in the
 * database. Under a race the second caller's lock wakes up against a row that no
 * longer matches "still live" and it leaves with nothing. Exactly one winner, at
 * any number of simultaneous presses, and that is row-level atomicity doing the
 * work rather than anything clever in this file.
 *
 * The word for what happened is `used`. This route watches a press arrive and
 * ciphertext go out; whether the browser on the other end could decrypt it never
 * leaves that tab, so `opened` is a claim only the recipient's own screen can make.
 *
 * No password is involved here and none can be. A wrong password fails against the
 * ciphertext already in the recipient's tab, which is why they can try again after
 * the link is spent. So this route refuses a body rather than ignoring one: a
 * client that could post a password would eventually be written as though something
 * here checked it.
 */

const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const GONE = 410;

/** Nothing, which is what this route takes. */
const NO_BODY = 0;

export const reveal = new Hono().post(
  "/:id/reveal",
  bodyLimit({
    maxSize: NO_BODY,
    onError: (c) =>
      c.json(
        { error: "a reveal takes nothing: no password is ever checked here" },
        BAD_REQUEST
      ),
  }),
  async (c) => {
    const id = c.req.param("id");

    if (!isSecretId(id)) {
      return c.json({ error: "there is nothing at this link" }, NOT_FOUND);
    }

    const released = await db.transaction(async (tx) => {
      /* Still live, and holding something to give. The lock is what makes this a
       * claim: a second transaction blocks here, then re-reads the row against
       * these same conditions and finds it no longer matches. */
      const [live] = await tx
        .select({ envelope: secrets.envelope, iv: secrets.envelopeIv })
        .from(secrets)
        .where(
          and(
            eq(secrets.id, id),
            isNull(secrets.usedAt),
            isNull(secrets.burnedAt),
            gt(secrets.expiresAt, sql`now()`),
            isNotNull(secrets.envelope),
            isNotNull(secrets.envelopeIv)
          )
        )
        .for("update");

      /* Live means there is something to release, so both halves are here. This
       * is what tells the type system so, and a row that somehow failed it is
       * left alone and reported as whatever it turns out to be. */
      if (!(live?.envelope && live.iv)) {
        return null;
      }

      await tx
        .update(secrets)
        .set({ envelope: null, envelopeIv: null, usedAt: sql`now()` })
        .where(eq(secrets.id, id));

      await countOne(tx, "reveals");

      return {
        ciphertext: bytesToBase64url(live.envelope),
        iv: bytesToBase64url(live.iv),
      };
    });

    if (released) {
      return c.json({ envelope: released, id });
    }

    // Nothing was claimed, so the caller is owed the truth about why. The lookup
    // is the same one the sealed page renders from, which is what keeps the
    // recipient's dead ends worded off one shape rather than two.
    const found = await lookUp(id);

    return found
      ? c.json(found, GONE)
      : c.json({ error: "there is nothing at this link" }, NOT_FOUND);
  }
);

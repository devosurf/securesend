import { and, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "./db/client";
import { count } from "./db/counters";
import { attachments, secrets } from "./db/schema";
import { forgetIdleCallers } from "./limits/gates";

/*
 * The janitor: an interval in this process, and everything in the product that has to
 * be forgotten rather than answered.
 *
 * It is a pure janitor, and that is what makes an in-process timer honest here rather
 * than a corner cut. Every read derives state from the timestamps, so an expired
 * secret is refused whether or not this has run; nothing below is load-bearing for
 * correctness. A missed pass costs disk bytes and a delayed count, which is why
 * self-hosting can promise "cleanup needs no external cron" and mean it.
 *
 * Two deaths, in this order.
 *
 * The scrub. A clock running out has to destroy the ciphertext and not merely stop
 * answering with it: "when an envelope dies the ciphertext is destroyed" is a claim on
 * a public page, and an expired row still holding readable bytes would make it false.
 * What is left is a tombstone, status and timestamps, and it reads as expired because
 * expiry is neither a used nor a burned timestamp.
 *
 * The delete. Seven days past expiry the tombstone goes too, after which a missing
 * secret is indistinguishable from one that never existed. The week in between is what
 * keeps the sender's "expired, never used" row and the recipient's honest dead ends
 * answerable while anybody is plausibly still asking about that handover.
 *
 * And one thing that is not a database row: the rate limiters' memory. It rides the
 * same beat because it is the same job, forgetting on a timer, and one timer in a
 * single-process product is easier to reason about than two.
 */

/**
 * How long a tombstone answers for after the secret's clock ran out.
 *
 * Not configurable. It is stated as a privacy property on the security page, so an
 * instance that quietly kept its rows for a month would be contradicting its own page,
 * and one that kept them for a day would break the sender's history without saying so.
 */
export const TOMBSTONE_DAYS = 7;

/** Often enough that expired bytes are gone in a minute, rarely enough to be free. */
const EVERY_MS = 60_000;

/** Expired, and nobody got to it first. What a secret dying of time looks like. */
const diedOfTime = and(
  lte(secrets.expiresAt, sql`now()`),
  isNull(secrets.usedAt),
  isNull(secrets.burnedAt)
);

/**
 * How many rows a statement touched. The driver types this nullable because not every
 * command reports one, and an update or a delete always does, so the fallback is a
 * type being honest about the driver rather than a case that happens.
 */
function touched(result: { rowCount: number | null }): number {
  return result.rowCount ?? 0;
}

/**
 * Destroys what every expired secret is still holding, and answers how many there were.
 *
 * The files go first and by subquery, so nothing has to be carried into this process to
 * decide what to delete: asking for the rows would ship every blob here to throw it
 * away. Then the envelope, and the `envelope is not null` on that update is what makes
 * this countable. A row already scrubbed does not match it, so a secret is counted on
 * the pass that killed it and never again.
 */
async function scrubExpired(): Promise<number> {
  return await db.transaction(async (tx) => {
    await tx
      .delete(attachments)
      .where(
        inArray(
          attachments.secretId,
          tx.select({ id: secrets.id }).from(secrets).where(diedOfTime)
        )
      );

    const dead = touched(
      await tx
        .update(secrets)
        .set({ envelope: null, envelopeIv: null })
        .where(and(diedOfTime, isNotNull(secrets.envelope)))
    );

    if (dead > 0) {
      /* On the day the janitor noticed rather than the day the clock passed. Nobody is
       * present at an expiry, so there is no moment to attribute it to but this one. */
      await count(tx, "expiries", dead);
    }

    return dead;
  });
}

/** Drops the rows nobody can be told anything useful about anymore. Files cascade. */
async function deleteTombstones(): Promise<number> {
  return touched(
    await db
      .delete(secrets)
      .where(
        lte(
          secrets.expiresAt,
          sql`now() - make_interval(days => ${TOMBSTONE_DAYS})`
        )
      )
  );
}

/** One pass. Exported so a test can run it exactly once, on its own terms. */
export async function sweep(): Promise<{ deleted: number; scrubbed: number }> {
  const scrubbed = await scrubExpired();
  const deleted = await deleteTombstones();

  return { deleted, scrubbed };
}

/**
 * Starts the interval, and takes one pass immediately: a process that was down for an
 * afternoon has an afternoon of expired ciphertext to destroy, and waiting a minute to
 * begin would be a minute of holding secrets whose time was up.
 *
 * A failed pass is logged and nothing else. The next one will find the same rows, and a
 * janitor that could take the process down with it would be a cleanup job that costs
 * more than the mess.
 */
export function startJanitor(): void {
  /* One pass at a time. A sweep against a struggling database can outlast the interval,
   * and passes piling up on top of each other would be the janitor making it worse. */
  let sweeping = false;

  function pass(): void {
    forgetIdleCallers();

    if (sweeping) {
      return;
    }

    sweeping = true;
    sweep()
      .catch((error) => {
        console.error("the sweep did not finish", error);
      })
      .finally(() => {
        sweeping = false;
      });
  }

  pass();

  // Unreferenced, so it is the http server that keeps this process alive and not the
  // cleanup timer: a janitor should never be the reason a container will not stop.
  setInterval(pass, EVERY_MS).unref();
}

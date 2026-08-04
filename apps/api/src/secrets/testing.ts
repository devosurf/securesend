import { randomBytes } from "node:crypto";
import { bytesToBase64url } from "@securesend/crypto/base64url";
import { newSecretId } from "@securesend/crypto/ids";
import { eq, sql } from "drizzle-orm";
import { app } from "../app";
import { db } from "../db/client";
import type { Counted } from "../db/counters";
import { attachments, dailyCounters, secrets } from "../db/schema";
import type { ReleasedAttachment } from "./attachments";

/*
 * One sealed envelope on a real instance, and a way to look at the row under it.
 *
 * Only tests import this. It is here rather than in each of them because every
 * route that acts on a secret has to make one first, and a fixture copied four
 * ways drifts four ways.
 *
 * The ciphertext is random bytes, and that is the point rather than a shortcut: to
 * these routes an envelope is opaque, so a fixture that encrypted something first
 * would be asserting a claim the api does not make. It also means a test can
 * compare what came back against what went in, byte for byte.
 */

const CREATED = 201;

/** 96 bits, which is the size AES-GCM is defined for. */
export const IV_BYTES = 12;

export type Expiry = "1h" | "24h" | "72h";

export interface Sealed {
  /** Always an array, empty when the fixture was asked for no files. */
  attachments: ReleasedAttachment[];
  envelope: { ciphertext: string; iv: string };
  expiresAt: string;
  id: string;
  managementToken: string;
}

export function bytes(length: number): string {
  return bytesToBase64url(randomBytes(length));
}

/** As many attachments as asked for, numbered from zero the way a client numbers them. */
export function attached(count: number, length = 64): ReleasedAttachment[] {
  return Array.from({ length: count }, (_unused, index) => ({
    ciphertext: bytes(length),
    index,
    iv: bytes(IV_BYTES),
  }));
}

/** Creates one envelope through the real route, so nothing here fakes a row. */
export async function seal(expiry: Expiry = "24h", files = 0): Promise<Sealed> {
  const envelope = { ciphertext: bytes(96), iv: bytes(IV_BYTES) };
  const carried = attached(files);

  const response = await app.request("/api/secrets", {
    body: JSON.stringify({
      attachments: carried,
      envelope,
      expiry,
      id: newSecretId(),
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (response.status !== CREATED) {
    throw new Error(
      `the fixture could not seal an envelope: ${response.status}`
    );
  }

  const answer = (await response.json()) as {
    expiresAt: string;
    id: string;
    managementToken: string;
  };

  return { attachments: carried, envelope, ...answer };
}

export async function rowOf(id: string) {
  const [found] = await db.select().from(secrets).where(eq(secrets.id, id));
  if (!found) {
    throw new Error("the envelope this test needs was never stored");
  }
  return found;
}

/** Whatever attachment rows a secret still has, in index order. */
export function attachmentRowsOf(id: string) {
  return db
    .select()
    .from(attachments)
    .where(eq(attachments.secretId, id))
    .orderBy(attachments.index);
}

/**
 * Puts a secret's expiry in the past, which is the only way to test that a read
 * notices. Expiry is a timestamp comparison on every read rather than a flag some
 * sweep sets, so nothing else has to have run for this to take effect.
 */
export async function expire(id: string): Promise<void> {
  await db
    .update(secrets)
    .set({ expiresAt: sql`now() - interval '1 minute'` })
    .where(eq(secrets.id, id));
}

/**
 * Puts a secret's expiry a whole number of days in the past, which is how a test walks
 * up to the tombstone window without waiting a week for it.
 */
export async function expiredDaysAgo(id: string, days: number): Promise<void> {
  await db
    .update(secrets)
    .set({ expiresAt: sql`now() - make_interval(days => ${days}, mins => 1)` })
    .where(eq(secrets.id, id));
}

/** The day's counter for one of the four things worth counting. */
export async function countToday(name: Counted): Promise<number> {
  const [today] = await db
    .select({ count: dailyCounters[name] })
    .from(dailyCounters)
    .where(eq(dailyCounters.day, sql`current_date`));

  return today?.count ?? 0;
}

import { zValidator } from "@hono/zod-validator";
import { base64urlToBytes } from "@securesend/crypto/base64url";
import { isSecretId } from "@securesend/crypto/ids";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { db } from "../db/client";
import { dailyCounters, secrets } from "../db/schema";
import { env } from "../env";
import { hashManagementToken, mintManagementToken } from "./management";

/*
 * Creating a secret, which is the only write a sender's browser makes.
 *
 * Everything of consequence has already happened by the time a request arrives:
 * the id, the key and the ciphertext were all made in the browser. So this route
 * has exactly three jobs. Refuse anything that is not an envelope this product
 * could have produced. Store it under the id the client chose, or say the id is
 * taken so the client can seal again. Hand back the management token, once.
 *
 * What it must never do is learn anything. The body is strict, so the key cannot
 * ride along in a field nobody reads, and no rejection quotes what it was given:
 * an error that carries ciphertext is an error that puts ciphertext in a log.
 */

const CREATED = 201;
const BAD_REQUEST = 400;
const CONFLICT = 409;
const TOO_LARGE = 413;

const EXPIRIES = ["1h", "24h", "72h"] as const;

/* Keyed by the list above, so an expiry offered without a lifetime, or given one
 * the schema will not accept, is a type error rather than a runtime surprise. */
const EXPIRY_HOURS: Record<(typeof EXPIRIES)[number], number> = {
  "1h": 1,
  "24h": 24,
  "72h": 72,
};

/**
 * How long an iv is on the wire: the 16 base64url characters that 96 bits of it
 * takes unpadded, 96 being the size AES-GCM is defined for. It is a character
 * count rather than a byte count because that is what the schema below measures.
 *
 * Stated here rather than imported: this schema is the wire format, and importing
 * it would pull the whole encryption module and its browser types into a Node
 * process. The create tests build their bodies with the real package, so a change
 * there reddens them.
 */
const IV_CHARS = 16;

/** How long unpadded base64url runs for a given number of bytes. */
function encodedLength(bytes: number): number {
  return Math.ceil((bytes * 4) / 3);
}

function isBase64url(value: string): boolean {
  try {
    base64urlToBytes(value);
    return true;
  } catch {
    return false;
  }
}

/*
 * A backstop rather than the product's rule: it is here so an absurd body is
 * refused before it is read into memory, and it is deliberately loose, because
 * the cap that matters is checked on the decoded bytes further down. Guessing a
 * byte cap from a transport length would have to allow for the encoding ratio
 * and for json escaping, and a cap that has to be guessed is a cap that drifts.
 */
const MAX_BODY_BYTES = encodedLength(env.maxEnvelopeBytes) * 2;

const createBody = z.strictObject({
  envelope: z.strictObject({
    ciphertext: z.string().min(1).refine(isBase64url, "not base64url"),
    iv: z.string().length(IV_CHARS).refine(isBase64url, "not base64url"),
  }),
  expiry: z.enum(EXPIRIES),
  id: z.string().refine(isSecretId, "not an id this product generates"),
});

/**
 * Which fields were refused, and nothing about what was in them. A zod issue
 * can carry the value it rejected, and one of these values is ciphertext, so the
 * error is written here rather than forwarded.
 */
function refusedFields(issues: readonly z.core.$ZodIssue[]): string[] {
  const paths = issues
    .map((issue) => issue.path.join("."))
    .filter((path) => path !== "");

  return [...new Set(paths)];
}

export const create = new Hono().post(
  "/",
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: "that envelope is too big" }, TOO_LARGE),
  }),
  zValidator("json", createBody, (result, c) =>
    result.success
      ? undefined
      : c.json(
          {
            error: "that is not an envelope this instance can store",
            fields: refusedFields(result.error.issues),
          },
          BAD_REQUEST
        )
  ),
  async (c) => {
    const { envelope, expiry, id } = c.req.valid("json");

    const ciphertext = base64urlToBytes(envelope.ciphertext);
    if (ciphertext.length > env.maxEnvelopeBytes) {
      return c.json(
        { error: "that envelope is too big", limit: env.maxEnvelopeBytes },
        TOO_LARGE
      );
    }

    const token = mintManagementToken();

    /* Both statements or neither: a create that was refused for a taken id must
     * not show up in the day's count. */
    const [row] = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(secrets)
        .values({
          envelope: ciphertext,
          envelopeIv: base64urlToBytes(envelope.iv),
          // Both timestamps come from the database's clock, so a lifetime is
          // exactly the preset and not the drift between two machines.
          expiresAt: sql`now() + make_interval(hours => ${EXPIRY_HOURS[expiry]})`,
          id,
          managementTokenHash: hashManagementToken(token),
        })
        .onConflictDoNothing()
        .returning({ expiresAt: secrets.expiresAt, id: secrets.id });

      if (inserted.length > 0) {
        await tx
          .insert(dailyCounters)
          .values({ creates: 1, day: sql`current_date` })
          .onConflictDoUpdate({
            set: { creates: sql`${dailyCounters.creates} + 1` },
            target: dailyCounters.day,
          });
      }

      return inserted;
    });

    // The client picked the id, so it can pick another one. Nothing has been
    // shared yet, so sealing again under a fresh id and a fresh key costs it
    // nothing at all.
    if (!row) {
      return c.json({ error: "that id is taken" }, CONFLICT);
    }

    return c.json(
      {
        expiresAt: row.expiresAt.toISOString(),
        id: row.id,
        managementToken: token,
      },
      CREATED
    );
  }
);

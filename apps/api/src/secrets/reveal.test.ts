import { newSecretId } from "@securesend/crypto/ids";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { closeDatabase, db } from "../db/client";
import { secrets } from "../db/schema";
import { countToday, expire, rowOf, seal } from "./testing";

afterAll(closeDatabase);

/*
 * The reveal, which is the only consuming action in the product.
 *
 * Two things have to be true of it and everything here is about one of them.
 *
 * It happens exactly once. Not once per user, not once unless two presses land in
 * the same millisecond: once, under any race, because a link that released its
 * payload twice would break the product's one promise while looking like it
 * worked. So the claim is a conditional update inside one transaction and the
 * hardest test here presses it from several directions at the same time.
 *
 * And it kills what it releases in the same breath. The ciphertext is scrubbed
 * before the transaction commits, so there is no window in which a secret has been
 * handed out and still sits in the database. What is left is a tombstone, which is
 * what lets the next person to arrive be told the truth.
 *
 * No password reaches this route, ever. It cannot check one, so it will not take
 * one: a request carrying a body is refused rather than quietly ignored.
 */

const OK = 200;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const GONE = 410;

interface Released {
  envelope: { ciphertext: string; iv: string };
  id: string;
}

/** What one presser got back: the payload, or the reason there was none. */
interface Answer {
  envelope?: { ciphertext: string; iv: string };
  state?: string;
}

function press(id: string, init?: RequestInit) {
  return app.request(`/api/secrets/${id}/reveal`, { method: "POST", ...init });
}

describe("POST /api/secrets/:id/reveal", () => {
  it("releases the envelope it was given, byte for byte", async () => {
    const sealed = await seal();

    const response = await press(sealed.id);
    expect(response.status).toBe(OK);

    const released = (await response.json()) as Released;
    expect(released.envelope).toStrictEqual(sealed.envelope);
    expect(released.id).toBe(sealed.id);
  });

  it("answers with the envelope and nothing else", async () => {
    const sealed = await seal();

    const released = (await (await press(sealed.id)).json()) as Released;

    expect(Object.keys(released).toSorted()).toStrictEqual(["envelope", "id"]);
    expect(Object.keys(released.envelope).toSorted()).toStrictEqual([
      "ciphertext",
      "iv",
    ]);
  });

  /* The scrub is the death. A row that had been handed out and still held its
   * ciphertext would be a secret this instance could serve twice. */
  it("scrubs the ciphertext it released, leaving a tombstone", async () => {
    const sealed = await seal();

    await press(sealed.id);

    const row = await rowOf(sealed.id);
    expect(row.envelope).toBeNull();
    expect(row.envelopeIv).toBeNull();
    expect(row.usedAt).not.toBeNull();
    expect(row.burnedAt).toBeNull();
    expect(row.expiresAt).not.toBeNull();
  });

  /*
   * The race, pressed from eight directions at once.
   *
   * Exactly one caller may leave with the payload and the other seven have to be
   * told the link is spent. This is the test the whole one-time claim rests on, so
   * it checks the database as well as the answers: the winner's ciphertext is gone
   * and the row says used once, not eight times.
   */
  it("releases the payload exactly once under a parallel press", async () => {
    const sealed = await seal();

    const answers = await Promise.all(
      Array.from({ length: 8 }, () => press(sealed.id))
    );
    const bodies = await Promise.all(
      answers.map(async (response) => ({
        body: (await response.json()) as Answer,
        status: response.status,
      }))
    );

    const winners = bodies.filter((answer) => answer.status === OK);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.body.envelope).toStrictEqual(sealed.envelope);

    for (const loser of bodies.filter((answer) => answer.status !== OK)) {
      expect(loser.status).toBe(GONE);
      expect(loser.body.state).toBe("used");
      expect(loser.body.envelope).toBeUndefined();
    }

    const row = await rowOf(sealed.id);
    expect(row.envelope).toBeNull();
    expect(row.envelopeIv).toBeNull();
  });

  it("counts one reveal for a parallel press, not one per presser", async () => {
    const sealed = await seal();
    const before = await countToday("reveals");

    await Promise.all(Array.from({ length: 8 }, () => press(sealed.id)));

    expect(await countToday("reveals")).toBe(before + 1);
  });

  it("never lets a released envelope be cached", async () => {
    const sealed = await seal();

    const response = await press(sealed.id);

    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

describe("POST /api/secrets/:id/reveal, refused", () => {
  it("tells the second presser the link is spent, and by what", async () => {
    const sealed = await seal();
    await press(sealed.id);

    const response = await press(sealed.id);
    expect(response.status).toBe(GONE);

    const answer = (await response.json()) as { state: string; usedAt: string };
    expect(answer.state).toBe("used");
    expect(answer.usedAt).not.toBeNull();
  });

  it("says the sender burned it when the sender burned it", async () => {
    const sealed = await seal();
    await db
      .update(secrets)
      .set({ burnedAt: sql`now()`, burnReason: "sender", envelope: null })
      .where(eq(secrets.id, sealed.id));

    const response = await press(sealed.id);

    expect(response.status).toBe(GONE);
    expect(await response.json()).toMatchObject({
      burnReason: "sender",
      state: "burned",
    });
  });

  /* Expiry is a timestamp comparison on every read, so nothing has to have run
   * for this to be refused, and the ciphertext is not handed over on the way. */
  it("refuses an expired envelope without releasing anything", async () => {
    const sealed = await seal();
    await expire(sealed.id);

    const response = await press(sealed.id);

    expect(response.status).toBe(GONE);
    expect(await response.json()).toMatchObject({ state: "expired" });

    const row = await rowOf(sealed.id);
    expect(row.usedAt).toBeNull();
    expect(row.envelope).not.toBeNull();
  });

  it("does not count a reveal it refused", async () => {
    const sealed = await seal();
    await expire(sealed.id);

    const before = await countToday("reveals");
    await press(sealed.id);

    expect(await countToday("reveals")).toBe(before);
  });

  it("has nothing at an id nothing was stored under, or at a non-id", async () => {
    const refused = await Promise.all([
      press(newSecretId()),
      press("nope"),
      press("!!!!!!!!!!!!!!!!!!!!!!"),
    ]);

    expect(refused.map((response) => response.status)).toStrictEqual([
      NOT_FOUND,
      NOT_FOUND,
      NOT_FOUND,
    ]);
  });

  /*
   * The route cannot check a password, so it refuses to be handed one. Quietly
   * ignoring a body would let a client start believing the server verifies
   * something, which is the one misunderstanding this product cannot afford.
   */
  it("refuses a request carrying a body, and stays sealed", async () => {
    const sealed = await seal();

    const response = await press(sealed.id, {
      body: JSON.stringify({ password: "northwind" }),
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(BAD_REQUEST);

    const row = await rowOf(sealed.id);
    expect(row.usedAt).toBeNull();
    expect(row.envelope).not.toBeNull();
  });
});

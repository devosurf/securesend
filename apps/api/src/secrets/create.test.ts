import { randomBytes } from "node:crypto";
import {
  base64urlToBytes,
  bytesToBase64url,
} from "@securesend/crypto/base64url";
import { newSecretId } from "@securesend/crypto/ids";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { closeDatabase, db } from "../db/client";
import { dailyCounters, secrets } from "../db/schema";
import { hashManagementToken, MANAGEMENT_TOKEN_LENGTH } from "./management";

afterAll(closeDatabase);

const CREATED = 201;
const BAD_REQUEST = 400;
const CONFLICT = 409;
const TOO_LARGE = 413;

const HOUR_MS = 3_600_000;
const IV_BYTES = 12;

type Expiry = "1h" | "24h" | "72h";

/*
 * A body to post. The ciphertext is random bytes, and that is the point rather
 * than a shortcut: to this route an envelope is opaque, so a test that had to
 * encrypt something first would be testing a claim the route does not make. The
 * id comes from the real generator, because that one the route does check.
 */
function bytes(length: number): string {
  return bytesToBase64url(randomBytes(length));
}

function draft(expiry: Expiry = "24h") {
  return {
    envelope: { ciphertext: bytes(96), iv: bytes(IV_BYTES) },
    expiry,
    id: newSecretId(),
  };
}

function post(body: unknown) {
  return app.request("/api/secrets", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function find(id: string) {
  return db.select().from(secrets).where(eq(secrets.id, id));
}

async function stored(id: string) {
  const [found] = await find(id);
  if (!found) {
    throw new Error("the envelope this test needs was never stored");
  }
  return found;
}

async function isStored(id: string) {
  const [found] = await find(id);
  return found !== undefined;
}

async function creates(): Promise<number> {
  const [today] = await db
    .select({ creates: dailyCounters.creates })
    .from(dailyCounters)
    .where(eq(dailyCounters.day, sql`current_date`));

  return today?.creates ?? 0;
}

describe("POST /api/secrets", () => {
  it("stores the ciphertext it was handed, byte for byte", async () => {
    const body = draft();

    const response = await post(body);
    expect(response.status).toBe(CREATED);

    const found = await stored(body.id);
    expect(found.envelope).toStrictEqual(
      base64urlToBytes(body.envelope.ciphertext)
    );
    expect(found.envelopeIv).toStrictEqual(base64urlToBytes(body.envelope.iv));
  });

  it("hands back the management token once, and keeps only its hash", async () => {
    const body = draft();

    const response = await post(body);
    const answer = (await response.json()) as { managementToken: string };

    expect(answer.managementToken).toHaveLength(MANAGEMENT_TOKEN_LENGTH);

    const found = await stored(body.id);
    expect(found.managementTokenHash).not.toBe(answer.managementToken);
    expect(found.managementTokenHash).toBe(
      hashManagementToken(answer.managementToken)
    );
  });

  it("gives every envelope its own token", async () => {
    const answers = (await Promise.all(
      [draft(), draft()].map(async (body) => (await post(body)).json())
    )) as { managementToken: string }[];

    expect(answers[0]?.managementToken).not.toBe(answers[1]?.managementToken);
  });

  it("answers with the id and when it dies, and nothing else", async () => {
    const body = draft();

    const answer = (await (await post(body)).json()) as { id: string };

    expect(Object.keys(answer).toSorted()).toStrictEqual([
      "expiresAt",
      "id",
      "managementToken",
    ]);
    expect(answer.id).toBe(body.id);
  });

  it("never lets a response be cached", async () => {
    const response = await post(draft());

    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it.each([
    ["1h", 1],
    ["24h", 24],
    ["72h", 72],
  ] as const)("expires %s from now", async (expiry, hours) => {
    const body = draft(expiry);

    await post(body);

    const found = await stored(body.id);
    const lifetime = found.expiresAt.getTime() - found.createdAt.getTime();
    expect(lifetime / HOUR_MS).toBeCloseTo(hours, 1);
  });

  it("starts sealed: nothing is used, burned, or given a reason", async () => {
    const body = draft();

    await post(body);

    const found = await stored(body.id);
    expect(found.usedAt).toBeNull();
    expect(found.burnedAt).toBeNull();
    expect(found.burnReason).toBeNull();
  });

  it("counts the create in the day's counters", async () => {
    const before = await creates();

    await post(draft());

    expect(await creates()).toBe(before + 1);
  });
});

describe("POST /api/secrets, refused", () => {
  it("refuses an id the client could not have generated", async () => {
    const body = draft();
    const wrong = [
      "",
      "too-short",
      `${newSecretId()}x`,
      "!!!!!!!!!!!!!!!!!!!!!!",
    ];

    const refused = await Promise.all(wrong.map((id) => post({ ...body, id })));

    expect(refused.map((response) => response.status)).toStrictEqual(
      wrong.map(() => BAD_REQUEST)
    );
  });

  it("refuses ciphertext that is not base64url", async () => {
    const body = draft();

    const response = await post({
      ...body,
      envelope: { ...body.envelope, ciphertext: "not base64url!" },
    });

    expect(response.status).toBe(BAD_REQUEST);
  });

  it("refuses an iv that is not the length an envelope uses", async () => {
    const body = draft();

    const lengths = [8, 16, 0];
    const refused = await Promise.all(
      lengths.map((length) =>
        post({ ...body, envelope: { ...body.envelope, iv: bytes(length) } })
      )
    );

    expect(refused.map((response) => response.status)).toStrictEqual(
      lengths.map(() => BAD_REQUEST)
    );
  });

  it("refuses an expiry that is not one of the three", async () => {
    const body = draft();

    const wrong = ["7d", "0h", "", "24 hours"];
    const refused = await Promise.all(
      wrong.map((expiry) => post({ ...body, expiry }))
    );

    expect(refused.map((response) => response.status)).toStrictEqual(
      wrong.map(() => BAD_REQUEST)
    );
  });

  it("refuses a body missing the envelope entirely", async () => {
    const body = draft();

    const response = await post({ expiry: body.expiry, id: body.id });

    expect(response.status).toBe(BAD_REQUEST);
  });

  /* The fragment token must not be postable, even by a caller trying to. A
   * schema that ignores what it does not know is a schema that would take the
   * key and hand it to a log line somebody adds later. */
  it("refuses a body carrying anything it did not ask for", async () => {
    const body = draft();

    const response = await post({ ...body, fragment: bytes(34) });

    expect(response.status).toBe(BAD_REQUEST);
    expect(await isStored(body.id)).toBe(false);
  });

  it("says which field it refused, and never quotes the value", async () => {
    const body = draft();

    const response = await post({
      ...body,
      envelope: { ...body.envelope, iv: "!!!!" },
    });
    const text = await response.text();

    expect(text).toContain("envelope.iv");
    expect(text).not.toContain(body.envelope.ciphertext.slice(0, 24));
  });

  it("refuses an envelope over the cap, and stores nothing", async () => {
    const body = draft();

    const response = await post({
      ...body,
      envelope: { ...body.envelope, ciphertext: bytes(300 * 1024) },
    });

    expect(response.status).toBe(TOO_LARGE);
    expect(await response.json()).toStrictEqual({
      error: expect.any(String),
      limit: 256 * 1024,
    });
    expect(await isStored(body.id)).toBe(false);
  });

  /* A body far past the cap is refused before it is read, so this one never
   * reaches the schema and answers without naming the product's limit. */
  it("refuses a body too big to be worth reading", async () => {
    const body = draft();

    const response = await post({
      ...body,
      envelope: { ...body.envelope, ciphertext: bytes(2 * 1024 * 1024) },
    });

    expect(response.status).toBe(TOO_LARGE);
    expect(await isStored(body.id)).toBe(false);
  });

  it("refuses a second envelope on a taken id, and leaves the first alone", async () => {
    const body = draft();

    await post(body);

    const response = await post({ ...draft(), id: body.id });
    expect(response.status).toBe(CONFLICT);

    const found = await stored(body.id);
    expect(found.envelope).toStrictEqual(
      base64urlToBytes(body.envelope.ciphertext)
    );
  });

  it("does not count a create it refused for a taken id", async () => {
    const body = draft();
    await post(body);

    const before = await creates();
    await post({ ...draft(), id: body.id });

    expect(await creates()).toBe(before);
  });
});

import { base64urlToBytes } from "@securesend/crypto/base64url";
import { newSecretId } from "@securesend/crypto/ids";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { closeDatabase, db } from "../db/client";
import { secrets } from "../db/schema";
import { hashManagementToken, MANAGEMENT_TOKEN_LENGTH } from "./management";
import {
  attached,
  attachmentRowsOf,
  bytes,
  countToday,
  type Expiry,
  IV_BYTES,
} from "./testing";

afterAll(closeDatabase);

const CREATED = 201;
const BAD_REQUEST = 400;
const CONFLICT = 409;
const TOO_LARGE = 413;

const HOUR_MS = 3_600_000;

/* A body to post. The ciphertext is random bytes, and that is the point rather than a
 * shortcut: to this route an envelope is opaque, so a test that had to encrypt something
 * first would be testing a claim the route does not make. The id comes from the real
 * generator, because that one the route does check. */
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
    const before = await countToday("creates");

    await post(draft());

    expect(await countToday("creates")).toBe(before + 1);
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

    const before = await countToday("creates");
    await post({ ...draft(), id: body.id });

    expect(await countToday("creates")).toBe(before);
  });
});

/*
 * Attachments, which to this route are the same thing an envelope is: bytes it
 * cannot read, under an id and a position it can check.
 *
 * The whole reason files are a separate table rather than more json is that a
 * 10MB attachment must not inflate the part every envelope has. The whole reason
 * this route sees no filename is that the name is inside the envelope, encrypted
 * with everything else. Both are load-bearing and both are tested here.
 */
describe("POST /api/secrets, attachments", () => {
  it("stores every attachment it was handed, byte for byte", async () => {
    const body = { ...draft(), attachments: attached(3) };

    const response = await post(body);
    expect(response.status).toBe(CREATED);

    const rows = await attachmentRowsOf(body.id);
    expect(rows.map((row) => row.index)).toStrictEqual([0, 1, 2]);
    expect(rows.map((row) => row.ciphertext)).toStrictEqual(
      body.attachments.map((one) => base64urlToBytes(one.ciphertext))
    );
    expect(rows.map((row) => row.iv)).toStrictEqual(
      body.attachments.map((one) => base64urlToBytes(one.iv))
    );
  });

  it("stores nothing but bytes and a position", async () => {
    const body = { ...draft(), attachments: attached(1) };

    await post(body);

    const [row] = await attachmentRowsOf(body.id);
    expect(Object.keys(row ?? {}).toSorted()).toStrictEqual([
      "ciphertext",
      "index",
      "iv",
      "secretId",
    ]);
  });

  /* The filename lives inside the envelope. A schema that ignored what it did not
   * ask for is how one would arrive in a column, and then in a log line somebody
   * adds later. */
  it("refuses an attachment carrying a name, a size or a type", async () => {
    const body = { ...draft(), attachments: attached(1) };
    const extras = [
      { name: "recovery-codes.txt" },
      { size: 4096 },
      { type: "text/plain" },
    ];

    const refused = await Promise.all(
      extras.map((extra) =>
        post({
          ...body,
          attachments: [{ ...body.attachments[0], ...extra }],
        })
      )
    );

    expect(refused.map((response) => response.status)).toStrictEqual(
      extras.map(() => BAD_REQUEST)
    );
  });

  it("takes an envelope with no attachments at all", async () => {
    const body = { ...draft(), attachments: [] };

    expect((await post(body)).status).toBe(CREATED);
    expect(await attachmentRowsOf(body.id)).toStrictEqual([]);
  });

  it("takes an envelope that does not mention attachments", async () => {
    const body = draft();

    expect((await post(body)).status).toBe(CREATED);
    expect(await attachmentRowsOf(body.id)).toStrictEqual([]);
  });

  it("counts one create for an envelope however many files it carries", async () => {
    const before = await countToday("creates");

    await post({ ...draft(), attachments: attached(4) });

    expect(await countToday("creates")).toBe(before + 1);
  });
});

describe("POST /api/secrets, attachments refused", () => {
  /* The indices are what bind each ciphertext to its place in the envelope's file
   * list, so a set that is not exactly 0..n-1 is an envelope that could not open.
   * Refusing it here beats storing a secret nobody can ever read. */
  it("refuses indices that are not the positions of a file list", async () => {
    const wrong = [
      [{ index: 1 }],
      [{ index: 0 }, { index: 2 }],
      [{ index: 0 }, { index: 0 }],
      [{ index: -1 }],
      [{ index: 0.5 }],
    ];

    const refused = await Promise.all(
      wrong.map((indices) => {
        const body = draft();
        const files = attached(indices.length);

        return post({
          ...body,
          attachments: files.map((one, at) => ({
            ...one,
            ...indices[at],
          })),
        });
      })
    );

    expect(refused.map((response) => response.status)).toStrictEqual(
      wrong.map(() => BAD_REQUEST)
    );
  });

  it("refuses an attachment iv that is not the length one uses", async () => {
    const body = { ...draft(), attachments: attached(1) };

    const response = await post({
      ...body,
      attachments: [{ ...body.attachments[0], iv: bytes(8) }],
    });

    expect(response.status).toBe(BAD_REQUEST);
  });

  it("refuses more files than one envelope may carry, and stores nothing", async () => {
    const body = { ...draft(), attachments: attached(11) };

    expect((await post(body)).status).toBe(BAD_REQUEST);
    expect(await isStored(body.id)).toBe(false);
  });

  /* The cap is on the whole secret rather than on any one part: two files inside
   * the per-file space that together pass the total are the case a per-file limit
   * would wave through. */
  it("refuses a total over the cap even when every part is under it", async () => {
    const body = {
      ...draft(),
      attachments: attached(2, 6 * 1024 * 1024),
    };

    const response = await post(body);

    expect(response.status).toBe(TOO_LARGE);
    expect(await response.json()).toStrictEqual({
      error: expect.any(String),
      limit: 10 * 1024 * 1024,
    });
    expect(await isStored(body.id)).toBe(false);
  });

  /* Neither half of the row may survive a refusal. An envelope stored without its
   * files is a secret that can never open, and files stored without their envelope
   * are bytes nobody will ever come back for. */
  it("stores neither the envelope nor the files when it refuses one", async () => {
    const body = { ...draft(), attachments: attached(2, 6 * 1024 * 1024) };

    await post(body);

    expect(await isStored(body.id)).toBe(false);
    expect(await attachmentRowsOf(body.id)).toStrictEqual([]);
  });

  it("still refuses a json part over its own cap, files or no files", async () => {
    const body = {
      ...draft(),
      attachments: attached(1),
      envelope: { ciphertext: bytes(300 * 1024), iv: bytes(IV_BYTES) },
    };

    const response = await post(body);

    expect(response.status).toBe(TOO_LARGE);
    expect(await response.json()).toStrictEqual({
      error: expect.any(String),
      limit: 256 * 1024,
    });
  });
});

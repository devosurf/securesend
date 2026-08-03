import { base64urlToBytes } from "@securesend/crypto/base64url";
import { newSecretId } from "@securesend/crypto/ids";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { closeDatabase, db } from "../db/client";
import { secrets } from "../db/schema";
import { expire, rowOf, seal } from "./testing";

afterAll(closeDatabase);

/*
 * The status lookup, which is the one route a stranger is expected to hit.
 *
 * Its whole job is to answer without doing anything, because a link pasted into
 * Slack is fetched by a preview bot before a human ever sees it. So the first
 * thing these tests establish is that asking, repeatedly, changes nothing.
 *
 * The second is that state is derived from the timestamps rather than stored, so
 * an expired envelope reads as expired whether or not any sweep has run.
 */

const OK = 200;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;

const STATUS_FIELDS = [
  "burnReason",
  "burnedAt",
  "createdAt",
  "expiresAt",
  "id",
  "state",
  "usedAt",
];

interface Status {
  burnedAt: string | null;
  burnReason: string | null;
  createdAt: string;
  expiresAt: string;
  id: string;
  state: string;
  usedAt: string | null;
}

function look(id: string) {
  return app.request(`/api/secrets/${id}`);
}

async function statusOf(id: string): Promise<Status> {
  const response = await look(id);
  if (response.status !== OK) {
    throw new Error(`the lookup this test needs answered ${response.status}`);
  }
  return (await response.json()) as Status;
}

function batch(body: unknown) {
  return app.request("/api/secrets/statuses", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

async function statusesOf(ids: string[]): Promise<Status[]> {
  const response = await batch({ ids });
  if (response.status !== OK) {
    throw new Error(`the lookup this test needs answered ${response.status}`);
  }
  return ((await response.json()) as { secrets: Status[] }).secrets;
}

/* A row marked the way a reveal or a burn would mark it, without going through
 * either: what is under test here is how a row is read, not how it got that way. */
function markUsed(id: string) {
  return db
    .update(secrets)
    .set({ usedAt: sql`now()` })
    .where(eq(secrets.id, id));
}

function markBurned(id: string) {
  return db
    .update(secrets)
    .set({ burnedAt: sql`now()`, burnReason: "sender" })
    .where(eq(secrets.id, id));
}

describe("GET /api/secrets/:id", () => {
  it("says a fresh envelope is sealed, and when it was made and dies", async () => {
    const sealed = await seal("1h");

    const status = await statusOf(sealed.id);

    expect(status.state).toBe("sealed");
    expect(status.id).toBe(sealed.id);
    expect(status.expiresAt).toBe(sealed.expiresAt);
    expect(Date.parse(status.createdAt)).toBeLessThanOrEqual(
      Date.parse(status.expiresAt)
    );
    expect(status.usedAt).toBeNull();
    expect(status.burnedAt).toBeNull();
    expect(status.burnReason).toBeNull();
  });

  /* Nothing here may hint at a password. The flag and the salt ride the fragment
   * precisely so the instance cannot tell which envelopes carry one, and an extra
   * field appearing in this answer is how that would quietly stop being true. */
  it("answers with these fields and no others, ever", async () => {
    const sealed = await seal();

    const status = await statusOf(sealed.id);

    expect(Object.keys(status).toSorted()).toStrictEqual(STATUS_FIELDS);
  });

  it("consumes nothing, however many times it is asked", async () => {
    const sealed = await seal();
    const before = await rowOf(sealed.id);

    await Promise.all(Array.from({ length: 12 }, () => look(sealed.id)));

    const after = await rowOf(sealed.id);
    expect(after).toStrictEqual(before);
    expect(after.envelope).toStrictEqual(
      base64urlToBytes(sealed.envelope.ciphertext)
    );
  });

  it("never lets an answer be cached", async () => {
    const sealed = await seal();

    const response = await look(sealed.id);

    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("has nothing at an id nothing was stored under", async () => {
    const response = await look(newSecretId());

    expect(response.status).toBe(NOT_FOUND);
  });

  /* A string that is not an id at all is indistinguishable from an id nothing was
   * stored under, on purpose: this answer must not teach the id format. */
  it("has nothing at a string that is not an id", async () => {
    const refused = await Promise.all(
      ["nope", "x".repeat(400), "!!!!!!!!!!!!!!!!!!!!!!"].map(look)
    );

    expect(refused.map((response) => response.status)).toStrictEqual([
      NOT_FOUND,
      NOT_FOUND,
      NOT_FOUND,
    ]);
  });

  it("says used once a reveal has spent it", async () => {
    const sealed = await seal();
    await markUsed(sealed.id);

    const status = await statusOf(sealed.id);

    expect(status.state).toBe("used");
    expect(status.usedAt).not.toBeNull();
  });

  it("says burned, and by whom, once the sender has burned it", async () => {
    const sealed = await seal();
    await markBurned(sealed.id);

    const status = await statusOf(sealed.id);

    expect(status.state).toBe("burned");
    expect(status.burnReason).toBe("sender");
  });

  it("says expired the moment the clock passes it, with no sweep involved", async () => {
    const sealed = await seal();
    await expire(sealed.id);

    const status = await statusOf(sealed.id);

    expect(status.state).toBe("expired");
  });

  /* Precedence: burned, then used, then expired, then sealed. A row can carry
   * more than one of these at once, and what it is called is what happened to it
   * rather than what the clock did afterwards. */
  it("calls a burned envelope burned even after its expiry passes", async () => {
    const sealed = await seal();
    await markBurned(sealed.id);
    await expire(sealed.id);

    expect((await statusOf(sealed.id)).state).toBe("burned");
  });

  it("calls a used envelope used even after its expiry passes", async () => {
    const sealed = await seal();
    await markUsed(sealed.id);
    await expire(sealed.id);

    expect((await statusOf(sealed.id)).state).toBe("used");
  });
});

describe("POST /api/secrets/statuses", () => {
  it("answers for every id it knows, in the order it was asked", async () => {
    const [first, second] = await Promise.all([seal("1h"), seal("72h")]);

    const answers = await statusesOf([first.id, second.id]);

    expect(answers.map((status) => status.id)).toStrictEqual([
      first.id,
      second.id,
    ]);
    expect(answers.map((status) => status.state)).toStrictEqual([
      "sealed",
      "sealed",
    ]);
  });

  /* A row the instance has forgotten is simply absent. The device asking still
   * holds it, so it can tell; nothing here has to say "never existed" out loud. */
  it("leaves out the ids it has nothing for", async () => {
    const sealed = await seal();

    const answers = await statusesOf([newSecretId(), sealed.id]);

    expect(answers.map((status) => status.id)).toStrictEqual([sealed.id]);
  });

  it("consumes nothing", async () => {
    const sealed = await seal();
    const before = await rowOf(sealed.id);

    await Promise.all(Array.from({ length: 6 }, () => statusesOf([sealed.id])));

    expect(await rowOf(sealed.id)).toStrictEqual(before);
  });

  it("answers with the same fields the single lookup does", async () => {
    const sealed = await seal();

    const [status] = await statusesOf([sealed.id]);

    expect(Object.keys(status ?? {}).toSorted()).toStrictEqual(STATUS_FIELDS);
  });

  it("refuses a list of nothing, or of things that are not ids", async () => {
    const refused = await Promise.all([
      batch({ ids: [] }),
      batch({ ids: ["nope"] }),
      batch({ ids: newSecretId() }),
      batch({}),
      batch({ ids: [newSecretId()], while: "you're at it" }),
    ]);

    expect(refused.map((response) => response.status)).toStrictEqual(
      refused.map(() => BAD_REQUEST)
    );
  });

  it("refuses a list longer than any device could honestly hold", async () => {
    const response = await batch({
      ids: Array.from({ length: 201 }, () => newSecretId()),
    });

    expect(response.status).toBe(BAD_REQUEST);
  });

  it("never lets an answer be cached", async () => {
    const sealed = await seal();

    const response = await batch({ ids: [sealed.id] });

    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

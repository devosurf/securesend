import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { countToday, seal } from "../secrets/testing";
import { closeDatabase, db } from "./client";
import { count } from "./counters";

afterAll(closeDatabase);

/*
 * The day's four numbers, and the shape of them, which is the claim.
 *
 * "We cannot tell you which IP opened your secret, because we do not record it" is a
 * sentence on a public page, and the counters are where it would quietly stop being
 * true: a counter is the one thing this product measures, and the way a counter becomes
 * surveillance is a dimension nobody argued about being added to it.
 *
 * So this seam is unusual for the repo. Most of it drives behaviour at a boundary; two
 * of these read the schema, because the property worth holding is not what the code does
 * with a column, it is that the column does not exist. A test of the increment would
 * pass just as happily against a table keyed by address.
 */

/**
 * Words that would make a row a fact about a person rather than about a day.
 *
 * Matched whole, against the parts of a snake_case name, which is what the real cases
 * look like: `ip`, `client_ip`, `remote_addr`, `user_agent`, `session_id`. A tripwire
 * rather than a proof, and it is deliberately not substring matching, because `ip`
 * inside `ciphertext` is the kind of false alarm that gets a test deleted.
 */
const ABOUT_A_CALLER = new Set([
  "addr",
  "address",
  "agent",
  "city",
  "client",
  "country",
  "device",
  "fingerprint",
  "forwarded",
  "host",
  "hostname",
  "ip",
  "ips",
  "peer",
  "referer",
  "referrer",
  "region",
  "session",
  "user",
]);

function namesACaller(column: string): boolean {
  return column.split("_").some((word) => ABOUT_A_CALLER.has(word));
}

async function columnsOf(table: string): Promise<string[]> {
  const found = await db.execute<{ name: string }>(sql`
    select column_name as name
    from information_schema.columns
    where table_schema = 'public' and table_name = ${table}
    order by column_name
  `);

  return found.rows.map((row) => row.name);
}

describe("the daily counters", () => {
  it("is a day and four numbers, and nothing else", async () => {
    expect(await columnsOf("daily_counters")).toStrictEqual([
      "burns",
      "creates",
      "day",
      "expiries",
      "reveals",
    ]);
  });

  it("has no way to say which secret a count was for", async () => {
    const columns = await columnsOf("daily_counters");

    expect(columns.some((name) => name.includes("secret"))).toBe(false);
    expect(columns.some((name) => name.includes("id"))).toBe(false);
  });
});

/*
 * The same claim, one step wider: there is nowhere in this database a request could be
 * traced through, not just nowhere in the counters.
 *
 * A secret's row holds what the sender chose and what became of it, an attachment holds
 * bytes and a position, and the counters hold a date. Nothing joins any of that to
 * whoever made the request, and the way that changes is a column arriving in a migration
 * nobody read closely. This is the test that has to be argued with first when one does.
 */
describe("this whole database", () => {
  it("has no column anywhere that names a caller", async () => {
    const found = await db.execute<{ column: string; table: string }>(sql`
      select table_name as table, column_name as column
      from information_schema.columns
      where table_schema = 'public' and table_name <> '__drizzle_migrations'
    `);
    expect(found.rows.length).toBeGreaterThan(0);

    const aboutSomebody = found.rows.filter((row) => namesACaller(row.column));

    expect(aboutSomebody).toStrictEqual([]);
  });
});

/*
 * Counting, which the product does in two rhythms.
 *
 * Creates, reveals and burns arrive one at a time, because a person did them. Expiries
 * do not: nobody is present when a clock runs out, so the sweep finds however many ran
 * out since it last looked and adds them together.
 */
describe("counting", () => {
  it("adds one when something happened once", async () => {
    const before = await countToday("creates");

    await seal();

    expect(await countToday("creates")).toBe(before + 1);
  });

  it("adds however many the caller found at once", async () => {
    const before = await countToday("expiries");

    await count(db, "expiries", 4);

    expect(await countToday("expiries")).toBe(before + 4);
  });

  it("moves one of the four and leaves the other three", async () => {
    const before = {
      burns: await countToday("burns"),
      expiries: await countToday("expiries"),
      reveals: await countToday("reveals"),
    };

    await count(db, "reveals", 2);

    expect(await countToday("reveals")).toBe(before.reveals + 2);
    expect(await countToday("burns")).toBe(before.burns);
    expect(await countToday("expiries")).toBe(before.expiries);
  });

  /* A create refused for its size never happened, so it is not in the day. The routes
   * each hold this from their own end; it is here because the counter is one shape and
   * "only what happened" is a property of the shape rather than of any one route. */
  it("holds nothing that was refused", async () => {
    const before = await countToday("creates");

    const response = await app.request("/api/secrets", {
      body: JSON.stringify({ expiry: "24h", id: "not-an-id" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.ok).toBe(false);

    expect(await countToday("creates")).toBe(before);
  });
});

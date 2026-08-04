import { afterAll, describe, expect, it } from "vitest";
import { app } from "./app";
import { closeDatabase } from "./db/client";
import { sweep, TOMBSTONE_DAYS } from "./janitor";
import {
  attachmentRowsOf,
  countToday,
  expire,
  expiredDaysAgo,
  rowOf,
  seal,
} from "./secrets/testing";

afterAll(closeDatabase);

/*
 * The janitor, and the two deaths it is responsible for.
 *
 * It is a pure janitor and that is the whole design: every read already refuses an
 * expired secret on the timestamp alone, so nothing here is load-bearing for
 * correctness and a missed run costs disk bytes rather than a promise. That is what
 * makes an in-process interval an honest answer instead of a cron job self-hosters
 * would have to wire up.
 *
 * First it scrubs. A clock running out has to destroy the ciphertext, not merely stop
 * answering with it, because "the ciphertext is destroyed when an envelope dies" is a
 * claim on a public page and a row sitting there refused-but-readable would make it
 * false. What is left is a tombstone.
 *
 * Then it deletes. Seven days past expiry the tombstone goes too, which is what makes
 * a missing secret indistinguishable from one that never existed. The week in between
 * is not an oversight either: it is what keeps the sender's "expired, never used" row
 * and the recipient's honest dead ends answerable for as long as anybody is still
 * asking about that handover.
 */

const OK = 200;
const GONE = 410;
const NOT_FOUND = 404;

function lookUp(id: string) {
  return app.request(`/api/secrets/${id}`);
}

function press(id: string) {
  return app.request(`/api/secrets/${id}/reveal`, { method: "POST" });
}

describe("the sweep, on an expired secret", () => {
  it("destroys the ciphertext and leaves the row standing", async () => {
    const sealed = await seal();
    await expire(sealed.id);

    await sweep();

    const row = await rowOf(sealed.id);
    expect(row.envelope).toBeNull();
    expect(row.envelopeIv).toBeNull();
    expect(row.createdAt).not.toBeNull();
    expect(row.expiresAt).not.toBeNull();
  });

  /* The tombstone rule, and the reason attachments are deleted rather than emptied
   * everywhere else in the product: a row left standing with its bytes scrubbed still
   * says how many files there were and roughly how big each one was. */
  it("deletes its files rather than emptying them", async () => {
    const sealed = await seal("24h", 3);
    await expire(sealed.id);

    await sweep();

    expect(await attachmentRowsOf(sealed.id)).toStrictEqual([]);
  });

  /* Precedence is untouched: expiry is neither a used nor a burned timestamp, so the
   * row still derives as expired and the recipient still gets the amber dead end
   * rather than being told somebody read their secret. */
  it("leaves it reading as expired, not as used or burned", async () => {
    const sealed = await seal();
    await expire(sealed.id);

    await sweep();

    const response = await lookUp(sealed.id);
    expect(response.status).toBe(OK);
    expect(await response.json()).toMatchObject({
      burnedAt: null,
      state: "expired",
      usedAt: null,
    });
  });

  it("releases nothing to a press that arrives afterwards", async () => {
    const sealed = await seal("24h", 2);
    await expire(sealed.id);
    await sweep();

    const response = await press(sealed.id);

    expect(response.status).toBe(GONE);
    expect(await response.json()).toMatchObject({ state: "expired" });
  });

  it("counts it in the day's expiries", async () => {
    const sealed = await seal();
    await expire(sealed.id);

    const before = await countToday("expiries");
    await sweep();

    expect(await countToday("expiries")).toBe(before + 1);
  });

  it("counts everything one pass found, not one thing", async () => {
    const three = await Promise.all([seal(), seal(), seal()]);
    await Promise.all(three.map((sealed) => expire(sealed.id)));

    const before = await countToday("expiries");
    await sweep();

    expect(await countToday("expiries")).toBe(before + three.length);
  });

  /* Counted once, ever. The scrub is what makes the row invisible to the next pass,
   * so the count is a count of deaths rather than of how often the janitor looked. */
  it("counts it once however many times it sweeps", async () => {
    const sealed = await seal();
    await expire(sealed.id);
    await sweep();

    const before = await countToday("expiries");
    await sweep();

    expect(await countToday("expiries")).toBe(before);
  });
});

describe("the sweep, on everything else", () => {
  it("leaves a live secret alone", async () => {
    const sealed = await seal("24h", 1);

    await sweep();

    const row = await rowOf(sealed.id);
    expect(row.envelope).not.toBeNull();
    expect(await attachmentRowsOf(sealed.id)).toHaveLength(1);
  });

  it("still lets a live secret be opened after a pass", async () => {
    const sealed = await seal();
    await sweep();

    const response = await press(sealed.id);

    expect(response.status).toBe(OK);
    expect(await response.json()).toMatchObject({ envelope: sealed.envelope });
  });

  /* A secret somebody read and then let expire died once, of being read. Counting it
   * again as an expiry would make the day's four numbers add up to more than the
   * things that happened. */
  it("does not count a used secret that later expired", async () => {
    const sealed = await seal();
    await press(sealed.id);
    await expire(sealed.id);

    const before = await countToday("expiries");
    await sweep();

    expect(await countToday("expiries")).toBe(before);
  });

  it("does not count a burned secret that later expired", async () => {
    const sealed = await seal();
    await app.request(`/api/secrets/${sealed.id}/burn`, {
      body: JSON.stringify({ managementToken: sealed.managementToken }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    await expire(sealed.id);

    const before = await countToday("expiries");
    await sweep();

    expect(await countToday("expiries")).toBe(before);
  });
});

/*
 * The week, from both ends.
 *
 * Inside it a tombstone answers, because somebody is plausibly still asking: a sender
 * checking what became of Monday's handover, a recipient following a link that sat in
 * an inbox. Past it the row is gone and the answer becomes the same one an id nobody
 * ever used gets, which is a privacy property rather than an oversight.
 */
describe("a tombstone's seven days", () => {
  it("still answers a day short of the week", async () => {
    const sealed = await seal();
    await expiredDaysAgo(sealed.id, TOMBSTONE_DAYS - 1);
    await sweep();

    const response = await lookUp(sealed.id);

    expect(response.status).toBe(OK);
    expect(await response.json()).toMatchObject({ state: "expired" });
  });

  it("is gone the day the week is up", async () => {
    const sealed = await seal();
    await expiredDaysAgo(sealed.id, TOMBSTONE_DAYS);

    await sweep();

    const response = await lookUp(sealed.id);
    expect(response.status).toBe(NOT_FOUND);
    await expect(rowOf(sealed.id)).rejects.toThrow();
  });

  it("says the same thing about it as about an id nobody ever used", async () => {
    const sealed = await seal();
    await expiredDaysAgo(sealed.id, TOMBSTONE_DAYS + 1);
    await sweep();

    const forgotten = await (await lookUp(sealed.id)).json();
    const invented = await (await lookUp("3Qk8mR2vT7yLb4NwXc5pAf")).json();

    expect(forgotten).toStrictEqual(invented);
  });

  it("takes its files with it, however it got them", async () => {
    const sealed = await seal("24h", 2);
    await expiredDaysAgo(sealed.id, TOMBSTONE_DAYS + 1);

    await sweep();

    expect(await attachmentRowsOf(sealed.id)).toStrictEqual([]);
  });

  /* A secret read on the day it was made still goes a week after its expiry rather
   * than a week after the reveal, because what the week is for is the sender's own row
   * and the sender chose the expiry. */
  it("goes a week past expiry whether or not it was ever read", async () => {
    const used = await seal();
    await press(used.id);
    await expiredDaysAgo(used.id, TOMBSTONE_DAYS);

    await sweep();

    await expect(rowOf(used.id)).rejects.toThrow();
  });
});

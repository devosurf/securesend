import { newSecretId } from "@securesend/crypto/ids";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { closeDatabase } from "../db/client";
import { mintManagementToken } from "./management";
import { countToday, expire, rowOf, seal } from "./testing";

afterAll(closeDatabase);

/*
 * Burn-now: the sender killing a secret before anybody reads it.
 *
 * There is no account behind this, so the whole of a sender's authority is the
 * management token their browser kept at create. The row holds only a hash of it,
 * which means this route can check that a caller has it and can learn nothing else
 * about who they are.
 *
 * Pressing it twice must be safe. The likeliest moment anyone burns a secret is the
 * few seconds after pasting a link into the wrong window, which is exactly when a
 * second press happens, so a burn that had already happened answers the same way
 * rather than complaining.
 *
 * A burn claims a sealed row and nothing else. A secret that was already used, or
 * whose clock ran out first, is not the sender's to rewrite: recording a burn over
 * it would tell the next visitor "the sender burned it" about something that had
 * already died on its own.
 */

const OK = 200;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;

interface Status {
  burnedAt: string | null;
  burnReason: string | null;
  state: string;
}

function ask(id: string, body: unknown) {
  return app.request(`/api/secrets/${id}/burn`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function burn(secret: { id: string; managementToken: string }) {
  return ask(secret.id, { managementToken: secret.managementToken });
}

describe("POST /api/secrets/:id/burn", () => {
  it("destroys the ciphertext and records who did it", async () => {
    const sealed = await seal();

    const response = await burn(sealed);
    expect(response.status).toBe(OK);

    const answer = (await response.json()) as Status;
    expect(answer.state).toBe("burned");
    expect(answer.burnReason).toBe("sender");
    expect(answer.burnedAt).not.toBeNull();

    const row = await rowOf(sealed.id);
    expect(row.envelope).toBeNull();
    expect(row.envelopeIv).toBeNull();
    expect(row.usedAt).toBeNull();
  });

  it("answers with a status and nothing the sender did not already have", async () => {
    const sealed = await seal();

    const answer = (await (await burn(sealed)).json()) as Record<
      string,
      unknown
    >;

    expect(Object.keys(answer).toSorted()).toStrictEqual([
      "burnReason",
      "burnedAt",
      "createdAt",
      "expiresAt",
      "id",
      "state",
      "usedAt",
    ]);
  });

  it("says the same thing the second time, and keeps the first burn's clock", async () => {
    const sealed = await seal();

    const first = (await (await burn(sealed)).json()) as Status;
    const again = await burn(sealed);

    expect(again.status).toBe(OK);
    expect(await again.json()).toStrictEqual(first);
  });

  it("counts one burn however many times it is pressed", async () => {
    const sealed = await seal();
    const before = await countToday("burns");

    await burn(sealed);
    await burn(sealed);

    expect(await countToday("burns")).toBe(before + 1);
  });

  it("never lets an answer be cached", async () => {
    const sealed = await seal();

    const response = await burn(sealed);

    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

describe("POST /api/secrets/:id/burn, refused", () => {
  it("refuses a token that does not manage this secret, and burns nothing", async () => {
    const sealed = await seal();

    const response = await ask(sealed.id, {
      managementToken: mintManagementToken(),
    });

    expect(response.status).toBe(FORBIDDEN);

    const row = await rowOf(sealed.id);
    expect(row.envelope).not.toBeNull();
    expect(row.burnedAt).toBeNull();
  });

  it("refuses another secret's token", async () => {
    const [mine, yours] = await Promise.all([seal(), seal()]);

    const response = await ask(mine.id, {
      managementToken: yours.managementToken,
    });

    expect(response.status).toBe(FORBIDDEN);
    expect((await rowOf(mine.id)).burnedAt).toBeNull();
  });

  it("refuses a body that is not a management token", async () => {
    const sealed = await seal();

    const refused = await Promise.all([
      ask(sealed.id, {}),
      ask(sealed.id, { managementToken: "" }),
      ask(sealed.id, { managementToken: 7 }),
      ask(sealed.id, { also: "this", managementToken: sealed.managementToken }),
    ]);

    expect(refused.map((response) => response.status)).toStrictEqual(
      refused.map(() => BAD_REQUEST)
    );
    expect((await rowOf(sealed.id)).burnedAt).toBeNull();
  });

  it("has nothing at an id nothing was stored under, or at a non-id", async () => {
    const token = mintManagementToken();

    const refused = await Promise.all([
      ask(newSecretId(), { managementToken: token }),
      ask("nope", { managementToken: token }),
    ]);

    expect(refused.map((response) => response.status)).toStrictEqual([
      NOT_FOUND,
      NOT_FOUND,
    ]);
  });

  /* Already read by somebody. There is nothing left to destroy and nothing for
   * the sender to claim, so the answer is what actually happened to it. */
  it("will not burn a secret that has already been used", async () => {
    const sealed = await seal();
    await app.request(`/api/secrets/${sealed.id}/reveal`, { method: "POST" });

    const response = await burn(sealed);

    expect(response.status).toBe(CONFLICT);
    expect(await response.json()).toMatchObject({ state: "used" });
    expect((await rowOf(sealed.id)).burnedAt).toBeNull();
  });

  it("will not burn a secret whose clock ran out first", async () => {
    const sealed = await seal();
    await expire(sealed.id);

    const response = await burn(sealed);

    expect(response.status).toBe(CONFLICT);
    expect(await response.json()).toMatchObject({ state: "expired" });
    expect((await rowOf(sealed.id)).burnedAt).toBeNull();
  });

  it("does not count a burn it refused", async () => {
    const sealed = await seal();
    const before = await countToday("burns");

    await ask(sealed.id, { managementToken: mintManagementToken() });

    expect(await countToday("burns")).toBe(before);
  });
});

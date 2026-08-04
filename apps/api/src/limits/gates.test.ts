import { newSecretId } from "@securesend/crypto/ids";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { closeDatabase } from "../db/client";
import { env } from "../env";
import { bytes, countToday, IV_BYTES, rowOf, seal } from "../secrets/testing";
import { A_DAY, type Bucket } from "./bucket";
import { buckets, forgetIdleCallers } from "./gates";

afterAll(closeDatabase);

/*
 * The three gated routes, driven until they refuse.
 *
 * These are the real buckets the process wires from the environment, at their real
 * defaults, because the thing worth testing is that a caller who goes too fast is
 * refused by the instance rather than by a bucket a test built. The setup file empties
 * them between tests, so each of these starts from an instance nobody has called.
 *
 * A refusal has to cost nothing. That is what most of this file is about: a create
 * refused for pace stores no row and moves no counter, and a reveal refused for pace
 * leaves the secret sealed, so a limiter can never be the thing that destroys a secret.
 */

const OK = 200;
const CREATED = 201;
const TOO_MANY = 429;

interface Refusal {
  error: string;
  retryAfter: number;
  scope: string;
}

function envelope() {
  return { ciphertext: bytes(96), iv: bytes(IV_BYTES) };
}

function post(path: string, body?: unknown) {
  return app.request(path, {
    ...(body !== undefined && { body: JSON.stringify(body) }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function makeOne(id = newSecretId()) {
  return post("/api/secrets", { envelope: envelope(), expiry: "24h", id });
}

/** Past every configured burst, so a route that refuses nothing fails loudly. */
const ENOUGH =
  Math.max(
    env.createPace.capacity,
    env.revealPace.capacity,
    env.statusPace.capacity
  ) + 2;

/** What `app.request` hands back, which is a response or a promise of one. */
type Call = () => Promise<Response> | Response;

/**
 * Calls until the instance refuses, and answers with the refusal.
 *
 * One at a time and never in parallel: a bucket is about the order presses arrive in,
 * so a batch of them would be testing something else.
 */
async function until429(call: Call, left = ENOUGH): Promise<Response> {
  if (left <= 0) {
    throw new Error("the instance refused nothing");
  }

  const response = await call();

  return response.status === TOO_MANY
    ? response
    : await until429(call, left - 1);
}

/** Empties a bucket without any requests, for a limit too generous to hammer. */
function drain(bucket: Bucket, key: string): void {
  while (bucket.take(key).ok) {
    // Nothing: the point is the taking.
  }
}

/** The scopes a run of creates was refused under, in order, one call at a time. */
async function scopesRefusing(
  times: number,
  seen: readonly string[] = []
): Promise<readonly string[]> {
  if (times <= 0) {
    return seen;
  }

  const said = (await (await makeOne()).json()) as Refusal;

  return await scopesRefusing(times - 1, [...seen, said.scope]);
}

/** How many creates get through in a row before something refuses one. */
async function createsThrough(soFar = 0): Promise<number> {
  if (soFar > ENOUGH) {
    throw new Error("the instance refused nothing");
  }

  return (await makeOne()).status === CREATED
    ? await createsThrough(soFar + 1)
    : soFar;
}

describe("a caller going faster than a route takes", () => {
  it("is refused on create, and told how long by the instance", async () => {
    const response = await until429(() => makeOne());
    expect(response.status).toBe(TOO_MANY);

    const said = (await response.json()) as Refusal;
    expect(said.scope).toBe("ip");
    expect(said.retryAfter).toBeGreaterThan(0);
    expect(response.headers.get("Retry-After")).toBe(String(said.retryAfter));
  });

  /* The whole reason a limiter is allowed near this product: it refuses work, it does
   * not do partial work. A create that answered 429 having already stored the row
   * would hand a sender a secret they were told was never sent. */
  it("stores nothing when it refuses a create", async () => {
    const id = newSecretId();

    await until429(() => makeOne());
    const response = await makeOne(id);

    expect(response.status).toBe(TOO_MANY);
    await expect(rowOf(id)).rejects.toThrow();
  });

  it("does not count a create it refused", async () => {
    await until429(() => makeOne());

    const before = await countToday("creates");
    await makeOne();

    expect(await countToday("creates")).toBe(before);
  });

  it("is refused on reveal, and the secret stays sealed", async () => {
    const sealed = await seal();

    await until429(() => post(`/api/secrets/${newSecretId()}/reveal`));
    const response = await post(`/api/secrets/${sealed.id}/reveal`);
    expect(response.status).toBe(TOO_MANY);

    const row = await rowOf(sealed.id);
    expect(row.usedAt).toBeNull();
    expect(row.envelope).not.toBeNull();
  });

  it("does not count a reveal it refused", async () => {
    const sealed = await seal();
    await until429(() => post(`/api/secrets/${newSecretId()}/reveal`));

    const before = await countToday("reveals");
    await post(`/api/secrets/${sealed.id}/reveal`);

    expect(await countToday("reveals")).toBe(before);
  });

  it("is refused on the one-id status lookup", async () => {
    const sealed = await seal();

    const response = await until429(() =>
      app.request(`/api/secrets/${sealed.id}`)
    );

    expect(((await response.json()) as Refusal).scope).toBe("ip");
  });

  /* Both shapes of the lookup share one bucket, because they are one route as far as
   * what they cost goes: a device asking about fifty ids in a body is the cheaper of
   * the two, and a caller who could get round a limit by switching shape has no limit. */
  it("is refused on the batch status lookup, off the same bucket", async () => {
    const sealed = await seal();
    const asking = () => post("/api/secrets/statuses", { ids: [sealed.id] });

    await until429(() => app.request(`/api/secrets/${sealed.id}`));

    expect((await asking()).status).toBe(TOO_MANY);
  });
});

/*
 * The watermark, which is the only limit that is not about one caller.
 *
 * The per-caller key is a caller's address, and a flood large enough to matter arrives
 * from as many addresses as it has machines. So creates are counted once more across
 * the whole instance, and this is the one that says "not you" when it refuses.
 *
 * It is drained rather than hammered. Its default is hundreds an hour, which is the
 * point of it, and a test that made hundreds of real requests to prove one branch
 * would be a slow test of the same one line.
 */
describe("the instance at its own creation limit", () => {
  it("refuses a create nobody's own bucket would have", async () => {
    drain(buckets.instanceCreates, "instance");

    const response = await makeOne();
    expect(response.status).toBe(TOO_MANY);

    const said = (await response.json()) as Refusal;
    expect(said.scope).toBe("instance");
    expect(said.retryAfter).toBeGreaterThan(0);
  });

  it("says it is the instance rather than the caller", async () => {
    drain(buckets.instanceCreates, "instance");

    const said = (await (await makeOne()).json()) as Refusal;

    expect(said.error).toContain("this instance");
    expect(said.error).not.toContain("one place");
  });

  /* Reveals and lookups are untouched by it. A watermark exists so a flood cannot
   * fill a disk, and refusing to hand over a secret somebody already holds the link
   * for would be the instance destroying its own promise to stay under load. */
  it("still lets a recipient open what they were sent", async () => {
    const sealed = await seal();
    drain(buckets.instanceCreates, "instance");

    const response = await post(`/api/secrets/${sealed.id}/reveal`);

    expect(response.status).toBe(OK);
  });

  /*
   * A refusal costs the caller nothing, which is what keeps the two scopes honest.
   *
   * Charging as it went would mean a sender retrying into a full instance spends their
   * own allowance on creates that never happened, and is then told they are going
   * faster than this instance takes from one place. That sentence would be false, and
   * it would be false because of the limiter rather than because of them.
   */
  it("spends none of the caller's own allowance while it refuses them", async () => {
    drain(buckets.instanceCreates, "instance");

    const scopes = await scopesRefusing(env.createPace.capacity * 2);
    expect(new Set(scopes)).toStrictEqual(new Set(["instance"]));

    /* The instance recovers. This caller made no secrets at all while it was full, so
     * their own allowance has to be exactly what it was before they started asking. */
    buckets.instanceCreates.clear();

    expect(await createsThrough()).toBe(env.createPace.capacity);
  });
});

/*
 * What a refusal is allowed to say.
 *
 * "We cannot tell you which IP opened your secret" is a claim on a public page, so a
 * limiter is the one place in this product where an address is in scope at all, and the
 * response is where it would leak. It names the mechanism and never the value.
 */
describe("what a refusal says", () => {
  it("carries the reason, the wait and the scope, and nothing else", async () => {
    const response = await until429(() => makeOne());

    const said = (await response.json()) as Refusal;

    expect(Object.keys(said).toSorted()).toStrictEqual([
      "error",
      "retryAfter",
      "scope",
    ]);
  });

  it("never quotes the address it counted", async () => {
    const response = await until429(() =>
      app.request("/api/secrets/statuses", {
        body: JSON.stringify({ ids: [newSecretId()] }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.7",
        },
        method: "POST",
      })
    );

    const body = await response.text();

    expect(body).not.toContain("203.0.113.7");
    expect(body).not.toContain("unknown");
  });

  /* Nothing this instance says may be kept, refusals included: a cached 429 would go
   * on refusing a caller the instance had already forgiven. */
  it("is not cacheable", async () => {
    const response = await until429(() => makeOne());

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("wears the headers bundle like every other response", async () => {
    const response = await until429(() => makeOne());

    expect(response.headers.get("Content-Security-Policy")).toContain(
      "default-src 'self'"
    );
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
});

/*
 * A forwarding header is trusted only when an operator names it, and this is why.
 *
 * Reading one by default would mean anybody could be a fresh caller on every request,
 * which is a limiter that limits nobody. The default here is the socket, and in these
 * tests there is no socket, so every caller shares one bucket: a header appearing in
 * the request must not change that.
 */
describe("who a caller is", () => {
  it("ignores a forwarding header nobody configured", async () => {
    expect(env.clientIpHeader).toBeUndefined();

    await until429(() => makeOne());

    const response = await app.request("/api/secrets", {
      body: JSON.stringify({
        envelope: envelope(),
        expiry: "24h",
        id: newSecretId(),
      }),
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.4",
      },
      method: "POST",
    });

    expect(response.status).toBe(TOO_MANY);
  });
});

/*
 * "Anything keyed to an IP address expires within 24 hours" is a claim on a public
 * page, and this is the wiring half of it: every bucket the process counts a caller in
 * is in one place, and the janitor's pass reaches all of them. A fifth bucket added
 * next to these and left out of that pass would keep addresses forever, quietly, and
 * this is the test that would notice.
 *
 * The other half is the bucket's own, where a day is measured on a clock a test holds.
 */
describe("what the janitor forgets", () => {
  it("drops a day-old caller from every bucket at once", () => {
    const aDayAgo = Date.now() - A_DAY;

    for (const bucket of Object.values(buckets)) {
      bucket.take("203.0.113.9", aDayAgo);
      expect(bucket.size()).toBe(1);
    }

    forgetIdleCallers();

    for (const bucket of Object.values(buckets)) {
      expect(bucket.size()).toBe(0);
    }
  });
});

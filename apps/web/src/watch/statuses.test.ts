import { newSecretId } from "@securesend/crypto/ids";
import { describe, expect, it } from "vitest";
import type { SentSecret } from "../compose/remember";
import { burnOne, statusesOf } from "./statuses";

/*
 * The sender's watching side, driven at its own boundary with a fake instance.
 *
 * Two of these are the point and the rest are the phrases. This device holds the only
 * record of what it sent, so what it must never do is put a key in that record or hand
 * its management token to anything but the one route that spends it. Both are asserted
 * against the bytes the fake instance was actually given, because nothing else can check
 * them: the api never sees a key, so the api cannot notice one arriving.
 *
 * The phrases are here because a row is a claim about somebody's secret and the words
 * beside the badge have to agree with it. "Sealed" over "never used" would be two
 * different answers on one line.
 */

const ORIGIN = "https://securesend.dev";
const NOW = Date.parse("2026-08-04T12:00:00.000Z");
const NOT_FOUND = 404;
const CONFLICT = 409;
const FORBIDDEN = 403;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function one(): SentSecret {
  return {
    expiresAt: new Date(NOW + HOUR).toISOString(),
    id: newSecretId(),
    managementToken: "a-management-token-aaaaaaaaaaaaaaaaaaaaaaa",
  };
}

function many(count: number): SentSecret[] {
  return Array.from({ length: count }, () => one());
}

function answer(
  id: string,
  state: string,
  when: Partial<Record<string, string | null>> = {}
) {
  return {
    burnedAt: null,
    createdAt: new Date(NOW - 24 * HOUR).toISOString(),
    expiresAt: new Date(NOW + 21 * HOUR).toISOString(),
    id,
    state,
    usedAt: null,
    ...when,
  };
}

function instance(reply: () => Response) {
  const asked: Request[] = [];

  const fetch: typeof globalThis.fetch = (input, init) => {
    asked.push(new Request(input as string, init));
    return Promise.resolve(reply());
  };

  return { asked, fetch, origin: ORIGIN };
}

const offline = {
  fetch: () => Promise.reject(new Error("offline")),
  origin: ORIGIN,
};

/** Everything the fake instance was told, as the text it was told it in. */
async function told(asked: Request[]) {
  const parts = await Promise.all(
    asked.map(async (request) =>
      [request.url, await request.clone().text()].join(" ")
    )
  );
  return parts.join("\n");
}

/** One remembered secret, one answer about it, one row back. */
async function rowFor(state: string, when?: Record<string, string | null>) {
  const held = one();
  const server = instance(() =>
    Response.json({ secrets: [answer(held.id, state, when)] })
  );

  const [row] = await statusesOf([held], server, NOW);

  return { held, row };
}

describe("statusesOf", () => {
  it("asks about every id it remembers, in one request", async () => {
    const remembered = many(3);
    const server = instance(() =>
      Response.json({
        secrets: remembered.map((held) => answer(held.id, "sealed")),
      })
    );

    const rows = await statusesOf(remembered, server, NOW);

    expect(server.asked).toHaveLength(1);
    expect(rows.map((row) => row.id)).toStrictEqual(
      remembered.map((held) => held.id)
    );
  });

  it("asks nothing at all when this browser remembers nothing", async () => {
    const server = instance(() => Response.json({ secrets: [] }));

    expect(await statusesOf([], server, NOW)).toStrictEqual([]);
    expect(server.asked).toHaveLength(0);
  });

  /* The lookup is public and asks by id. A token sent along with it would be authority
   * handed to a route with no use for it, which is how a credential ends up in an access
   * log for no reason at all. */
  it("never sends a management token to a lookup", async () => {
    const remembered = many(2);
    const server = instance(() =>
      Response.json({
        secrets: remembered.map((held) => answer(held.id, "sealed")),
      })
    );

    await statusesOf(remembered, server, NOW);

    const asked = await told(server.asked);
    for (const held of remembered) {
      expect(asked).not.toContain(held.managementToken);
    }
  });

  /* A row is the link without the part that opens it, so there is nothing complete to
   * copy and nothing to re-send. It exists to be matched against the message the sender
   * already sent, and matching is reading rather than clicking. */
  it("shows the link without its key, and never a hash", async () => {
    const { held, row } = await rowFor("sealed");

    expect(row?.shown).toBe(`securesend.dev/s/${held.id}`);
    expect(row?.shown).not.toContain("#");
  });

  it("counts down only while a secret is sealed", async () => {
    const { row } = await rowFor("sealed");

    expect(row?.status).toBe("sealed");
    expect(row?.timing).toBe("21 hours left");
  });

  it("says how long ago a secret was used, and never who used it", async () => {
    const { row } = await rowFor("used", {
      usedAt: new Date(NOW - 14 * MINUTE).toISOString(),
    });

    expect(row?.timing).toBe("14 minutes ago");
  });

  it("names the sender on a burn, because only the sender can burn", async () => {
    const { row } = await rowFor("burned", {
      burnedAt: new Date(NOW - 2 * HOUR).toISOString(),
    });

    expect(row?.timing).toBe("by you, 2 hours ago");
  });

  /* The useful fact about an expiry is not when the clock ran out. It is that nobody
   * read what was inside, which is the part the sender has to act on. */
  it("says never used on an expiry rather than a time", async () => {
    const { row } = await rowFor("expired");

    expect(row?.timing).toBe("never used");
  });

  /* A secret's whole life is at most 72 hours, so no row can honestly count days, and
   * one saying "6 days left" would be a row about a product that does not exist. */
  it("never counts a secret's remaining life in days", async () => {
    const { row } = await rowFor("sealed", {
      expiresAt: new Date(NOW + 71 * HOUR).toISOString(),
    });

    expect(row?.timing).toBe("71 hours left");
  });

  it("leaves out an id the instance has nothing for", async () => {
    const forgotten = one();
    const known = one();
    const server = instance(() =>
      Response.json({ secrets: [answer(known.id, "used")] })
    );

    const rows = await statusesOf([forgotten, known], server, NOW);

    expect(rows.map((row) => row.id)).toStrictEqual([known.id]);
  });

  it("shows no row for a state this build has never heard of", async () => {
    const { row } = await rowFor("reticulated");

    expect(row).toBeUndefined();
  });

  it("leaves the rows alone when nothing answers", async () => {
    expect(await statusesOf(many(2), offline, NOW)).toStrictEqual([]);
  });
});

describe("burnOne", () => {
  it("sends the token to the burn, and nothing else with it", async () => {
    const held = one();
    const server = instance(() =>
      Response.json(
        answer(held.id, "burned", { burnedAt: new Date(NOW).toISOString() })
      )
    );

    await burnOne(held, server, NOW);

    const [request] = server.asked;
    expect(request?.method).toBe("POST");
    expect(await request?.clone().json()).toStrictEqual({
      managementToken: held.managementToken,
    });
  });

  it("hands back the row the secret has become", async () => {
    const held = one();
    const server = instance(() =>
      Response.json(
        answer(held.id, "burned", { burnedAt: new Date(NOW).toISOString() })
      )
    );

    const burned = await burnOne(held, server, NOW);

    expect(burned.status).toBe("answered");
    expect(burned.status === "answered" && burned.watched).toStrictEqual({
      id: held.id,
      shown: `securesend.dev/s/${held.id}`,
      status: "burned",
      timing: "by you, just now",
    });
  });

  /* A burn can lose a race: somebody read it a second earlier, or the clock ran out
   * first. The answer is what the secret is now, and the row takes it. */
  it("takes the state the instance reports when the burn lost", async () => {
    const held = one();
    const server = instance(() =>
      Response.json(
        answer(held.id, "used", {
          usedAt: new Date(NOW - MINUTE).toISOString(),
        }),
        { status: CONFLICT }
      )
    );

    const burned = await burnOne(held, server, NOW);

    expect(burned.status === "answered" && burned.watched.status).toBe("used");
  });

  it("says the instance has forgotten it when there is nothing there", async () => {
    const server = instance(() =>
      Response.json({ error: "nothing here" }, { status: NOT_FOUND })
    );

    expect((await burnOne(one(), server, NOW)).status).toBe("forgotten");
  });

  it("says it did not go through when the instance refuses the token", async () => {
    const server = instance(() =>
      Response.json({ error: "not yours" }, { status: FORBIDDEN })
    );

    expect((await burnOne(one(), server, NOW)).status).toBe("refused");
  });

  it("says it did not go through when nothing answers", async () => {
    expect((await burnOne(one(), offline, NOW)).status).toBe("refused");
  });
});

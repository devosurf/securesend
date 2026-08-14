import { newSecretId } from "@securesend/crypto/ids";
import { describe, expect, it } from "vitest";
import type { SentSecret } from "../compose/remember";
import { burnOne, isDone, statusesOf, type Watched } from "./statuses";

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
const TOO_MANY = 429;
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

  const [row] = await rowsOf([held], server);

  return { held, row };
}

/** The rows a landed re-check came back with, for a test that is about the rows. */
async function rowsOf(
  remembered: Parameters<typeof statusesOf>[0],
  server: Parameters<typeof statusesOf>[1]
) {
  const checked = await statusesOf(remembered, server, NOW);

  return checked.status === "answered" ? checked.rows : [];
}

describe("statusesOf", () => {
  it("asks about every id it remembers, in one request", async () => {
    const remembered = many(3);
    const server = instance(() =>
      Response.json({
        secrets: remembered.map((held) => answer(held.id, "sealed")),
      })
    );

    const rows = await rowsOf(remembered, server);

    expect(server.asked).toHaveLength(1);
    expect(rows.map((row) => row.id)).toStrictEqual(
      remembered.map((held) => held.id)
    );
  });

  it("asks nothing at all when this browser remembers nothing", async () => {
    const server = instance(() => Response.json({ secrets: [] }));

    expect(await statusesOf([], server, NOW)).toStrictEqual({
      rows: [],
      status: "answered",
    });
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

    const rows = await rowsOf([forgotten, known], server);

    expect(rows.map((row) => row.id)).toStrictEqual([known.id]);
  });

  it("shows no row for a state this build has never heard of", async () => {
    const { row } = await rowFor("reticulated");

    expect(row).toBeUndefined();
  });

  /*
   * Nothing answering is not the same as nothing being there, and this is the whole
   * reason: the sender's panel is built from what comes back, so an empty list on a
   * dropped connection would delete their history over a bad second of wifi.
   * "Unreachable" says ask again, an empty list says you have sent nothing.
   */
  it("says nothing answered rather than answering with no rows", async () => {
    expect(await statusesOf(many(2), offline, NOW)).toStrictEqual({
      status: "unreachable",
    });
  });

  it("says nothing answered when the instance answers something unreadable", async () => {
    const server = instance(() => Response.json({ mood: "cryptic" }));

    expect(await statusesOf(many(2), server, NOW)).toStrictEqual({
      status: "unreachable",
    });
  });

  it("answers with no rows when this browser has sent nothing", async () => {
    const server = instance(() => Response.json({ secrets: [] }));

    expect(await statusesOf([], server, NOW)).toStrictEqual({
      rows: [],
      status: "answered",
    });
  });

  /*
   * Being metered is a third answer, and it has to be: this is the busiest of the gated
   * routes, so an office behind one address reaches its limit honestly. Folding it into
   * "nothing answered" would send a sender to check a connection that is fine, and
   * folding it into an empty list would delete their history for going too fast.
   */
  it("says metered when the instance declines to answer this often", async () => {
    const server = instance(() =>
      Response.json(
        { error: "not that fast", retryAfter: 18, scope: "ip" },
        { status: TOO_MANY }
      )
    );

    expect(await statusesOf(many(2), server, NOW)).toStrictEqual({
      retryAfter: 18,
      status: "metered",
    });
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

/*
 * The rule the clear on the homepage is built on, pinned on its own because the thing
 * it protects is invisible on screen.
 *
 * Every row looks alike, and one kind of them carries this browser's only authority to
 * end a secret early. Forgetting a sealed row would leave that secret alive for the rest
 * of its expiry with nobody able to burn it, so a status quietly moving to the wrong side
 * of this line is a bug with no symptom until somebody needs the token that went with it.
 */
describe("isDone", () => {
  function row(status: Watched["status"]): Watched {
    return { id: "an-id", shown: "securesend.dev/s/an-id", status, timing: "" };
  }

  it("holds a sealed row back, because its token is still worth something", () => {
    expect(isDone(row("sealed"))).toBe(false);
  });

  it("lets go of every row nothing can happen to", () => {
    expect(isDone(row("used"))).toBe(true);
    expect(isDone(row("burned"))).toBe(true);
    expect(isDone(row("expired"))).toBe(true);
  });
});

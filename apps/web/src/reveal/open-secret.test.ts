import { sealEnvelope } from "@securesend/crypto/envelope";
import { newSecretId } from "@securesend/crypto/ids";
import { describe, expect, it } from "vitest";
import { type Address, lookUp, spend, takeKey, unseal } from "./open-secret";

/*
 * The recipient's crossing, driven at its own boundary with a fake instance on the
 * other side.
 *
 * What it is here to prove is the half of the zero-knowledge rule the api cannot
 * check: the key arrives in this tab and leaves it in no direction at all. Not in a
 * request, not in the address the browser keeps. Every other test here exists
 * because it would be a way for that to quietly stop being true, or a way for the
 * one irreversible act in the product to happen twice or for nothing.
 */

const ID = newSecretId();
const ORIGIN = "https://securesend.dev";
const NOT_FOUND = 404;
const GONE = 410;
const SERVER_ERROR = 500;

const CREATED = "2026-08-03T12:00:00.000Z";
const EXPIRES = "2026-08-04T12:00:00.000Z";

function status(state: string, when: Partial<Record<string, string>> = {}) {
  return {
    burnedAt: null,
    createdAt: CREATED,
    expiresAt: EXPIRES,
    id: ID,
    state,
    usedAt: null,
    ...when,
  };
}

/** An address bar, and a record of what this module left in it. */
function address(hash: string) {
  const written: string[] = [];

  const at: Address = {
    hash,
    path: `/s/${ID}`,
    replace(url) {
      written.push(url);
    },
  };

  return { at, written };
}

function instance(reply: (attempt: number, request: Request) => Response) {
  const asked: Request[] = [];

  const fetch: typeof globalThis.fetch = (input, init) => {
    const request = new Request(input as string, init);
    asked.push(request);
    return Promise.resolve(reply(asked.length - 1, request));
  };

  return { asked, fetch, origin: ORIGIN };
}

/** An instance that is not there, which is a different thing from a dead link. */
const offline = {
  fetch: () => Promise.reject(new Error("offline")),
  origin: ORIGIN,
};

/** Everything the fake instance was told, as the text it was told it in. */
async function sent(asked: Request[]) {
  const parts = await Promise.all(
    asked.map(async (request) =>
      [request.url, await request.clone().text()].join(" ")
    )
  );
  return parts.join("\n");
}

/** One real envelope, sealed the way a sender's browser seals it. */
async function sealed(password?: string) {
  const made = await sealEnvelope(
    {
      credentials: { password: "x7Kq-9m2P", username: "svc-deploy" },
      note: "vpn access for the migration",
    },
    password
  );

  return { ...made, id: made.stored.id };
}

function keyOf(fragmentToken: string) {
  const read = takeKey(address(`#${fragmentToken}`).at);
  if (read.status !== "ok") {
    throw new Error("the fixture's own token did not decode");
  }
  return read.token;
}

describe("takeKey", () => {
  it("hands back the key that arrived after the hash", async () => {
    const made = await sealed();

    const read = takeKey(address(`#${made.fragmentToken}`).at);

    expect(read.status).toBe("ok");
  });

  it("leaves the address with no fragment in it", async () => {
    const made = await sealed();
    const bar = address(`#${made.fragmentToken}`);

    takeKey(bar.at);

    expect(bar.written).toStrictEqual([`/s/${ID}`]);
    expect(bar.written.join("")).not.toContain("#");
    expect(bar.written.join("")).not.toContain(made.fragmentToken);
  });

  /* A link that lost its tail is answered here, before anything is asked of the
   * instance, which is the whole reason this state is calm: nothing was fetched,
   * nothing was decrypted, and nothing was spent finding out. */
  it("calls a link with no fragment incomplete", () => {
    expect(takeKey(address("").at).status).toBe("incomplete");
  });

  it("calls a truncated fragment incomplete", async () => {
    const made = await sealed();
    const cut = made.fragmentToken.slice(0, 20);

    expect(takeKey(address(`#${cut}`).at).status).toBe("incomplete");
  });

  it("takes the fragment out of the address even when it was rubbish", () => {
    const bar = address("#not-a-key");

    takeKey(bar.at);

    expect(bar.written).toStrictEqual([`/s/${ID}`]);
  });
});

describe("lookUp", () => {
  it("reports a sealed link and when it dies", async () => {
    const server = instance(() => Response.json(status("sealed")));

    const arrival = await lookUp(ID, server);

    expect(arrival.state).toBe("sealed");
    expect(arrival.answered?.expiresAt).toBe(EXPIRES);
  });

  it("asks with a GET, so a preview bot cannot consume anything", async () => {
    const server = instance(() => Response.json(status("sealed")));

    await lookUp(ID, server);

    expect(server.asked.map((request) => request.method)).toStrictEqual([
      "GET",
    ]);
  });

  it.each(["used", "burned", "expired"])("reports %s", async (state) => {
    const server = instance(() =>
      Response.json(status(state, { burnedAt: CREATED, usedAt: CREATED }))
    );

    expect((await lookUp(ID, server)).state).toBe(state);
  });

  it("reports missing when the instance has nothing", async () => {
    const server = instance(() =>
      Response.json({ error: "nothing here" }, { status: NOT_FOUND })
    );

    expect((await lookUp(ID, server)).state).toBe("missing");
  });

  /* Nothing answered, so nothing is known. Calling that missing would tell a
   * recipient their secret is gone on the strength of a dropped connection. */
  it("says nothing answered rather than guessing the link is dead", async () => {
    const arrival = await lookUp(ID, offline);

    expect(arrival.state).toBe("unreachable");
  });

  it("says nothing answered when the instance answers something unreadable", async () => {
    const server = instance(() =>
      Response.json({ mood: "cryptic" }, { status: SERVER_ERROR })
    );

    expect((await lookUp(ID, server)).state).toBe("unreachable");
  });
});

describe("spend", () => {
  it("hands back the ciphertext the instance was holding", async () => {
    const made = await sealed();
    const server = instance(() =>
      Response.json({ envelope: made.stored.envelope, id: made.id })
    );

    const spent = await spend(made.id, server);

    expect(spent.status).toBe("held");
    expect(spent.status === "held" && spent.envelope).toStrictEqual(
      made.stored.envelope
    );
  });

  it("never sends the key or a password with the press", async () => {
    const made = await sealed("northwind");
    const server = instance(() =>
      Response.json({ envelope: made.stored.envelope, id: made.id })
    );

    await spend(made.id, server);

    const asked = await sent(server.asked);
    expect(asked).not.toContain(made.fragmentToken);
    expect(asked).not.toContain("northwind");
    expect(server.asked).toHaveLength(1);
  });

  it("presses once, and the press carries no body at all", async () => {
    const made = await sealed();
    const server = instance(() =>
      Response.json({ envelope: made.stored.envelope, id: made.id })
    );

    await spend(made.id, server);

    const [press] = server.asked;
    expect(press?.method).toBe("POST");
    expect(await press?.clone().text()).toBe("");
  });

  it.each(["used", "burned", "expired"])(
    "reports the dead end when the press lands on a %s link",
    async (state) => {
      const server = instance(() =>
        Response.json(status(state, { burnedAt: CREATED, usedAt: CREATED }), {
          status: GONE,
        })
      );

      const spent = await spend(ID, server);

      expect(spent.status).toBe("gone");
      expect(spent.status === "gone" && spent.arrival.state).toBe(state);
    }
  );

  it("reports missing when the press finds nothing there", async () => {
    const server = instance(() =>
      Response.json({ error: "nothing here" }, { status: NOT_FOUND })
    );

    const spent = await spend(ID, server);

    expect(spent.status === "gone" && spent.arrival.state).toBe("missing");
  });

  /* Nothing answered, so nothing was spent. This has to be a different answer from
   * a dead link, because the recipient can press again and must be told so. */
  it("says nothing answered when nothing answers", async () => {
    const spent = await spend(ID, offline);

    expect(spent.status).toBe("unreachable");
  });
});

describe("unseal", () => {
  it("opens an envelope that needs no password", async () => {
    const made = await sealed();

    const opened = await unseal({
      envelope: made.stored.envelope,
      id: made.id,
      token: keyOf(made.fragmentToken),
    });

    expect(opened.status).toBe("open");
    expect(opened.status === "open" && opened.secret.note).toBe(
      "vpn access for the migration"
    );
  });

  /*
   * The retry, which is the whole shape of the password feature.
   *
   * The link is already spent by the time this happens: the ciphertext is in this
   * tab and nowhere else. So a wrong password costs one local decryption and the
   * right one, on the very same bytes, opens it. No request is made by either,
   * which is why the try count is honest and why no limit could be enforced.
   */
  it("fails a wrong password locally, then opens on the right one", async () => {
    const made = await sealed("northwind");
    const held = {
      envelope: made.stored.envelope,
      id: made.id,
      token: keyOf(made.fragmentToken),
    };

    const wrong = await unseal({ ...held, password: "northwynd" });
    const alsoWrong = await unseal({ ...held, password: "" });
    const right = await unseal({ ...held, password: "northwind" });

    expect(wrong.status).toBe("closed");
    expect(alsoWrong.status).toBe("closed");
    expect(right.status).toBe("open");
    expect(right.status === "open" && right.secret.credentials).toStrictEqual({
      password: "x7Kq-9m2P",
      username: "svc-deploy",
    });
  });

  it("stays shut when a password-protected envelope is opened without one", async () => {
    const made = await sealed("northwind");

    const opened = await unseal({
      envelope: made.stored.envelope,
      id: made.id,
      token: keyOf(made.fragmentToken),
    });

    expect(opened.status).toBe("closed");
  });

  /* A key can be damaged in a way the token reader cannot see, because the format
   * carries no checksum. It closes here instead, which is still closed. */
  it("stays shut when the key survived decoding but is not the key", async () => {
    const made = await sealed();
    const other = await sealed();

    const opened = await unseal({
      envelope: made.stored.envelope,
      id: made.id,
      token: keyOf(other.fragmentToken),
    });

    expect(opened.status).toBe("closed");
  });

  /* Ciphertext cannot be served under another id: the id is bound into it. So a
   * swapped row closes rather than opening somebody else's secret. */
  it("stays shut when the ciphertext belongs to another link", async () => {
    const made = await sealed();

    const opened = await unseal({
      envelope: made.stored.envelope,
      id: newSecretId(),
      token: keyOf(made.fragmentToken),
    });

    expect(opened.status).toBe("closed");
  });
});

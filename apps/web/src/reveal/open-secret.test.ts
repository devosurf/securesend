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
const TOO_MANY = 429;
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

const PROFILE = new Uint8Array([
  0x23, 0x20, 0x6f, 0x76, 0x70, 0x6e, 0x0a, 0xff,
]);

/** The same, with a file in it, which is a second ciphertext on the wire. */
async function sealedWithFile() {
  const made = await sealEnvelope({
    files: [
      {
        bytes: PROFILE,
        name: "northwind-vpn-profile.ovpn",
        type: "application/x-openvpn-profile",
      },
    ],
    note: "vpn access for the migration",
  });

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

  /* Refused for pace, which is neither a dead link nor an instance that could not be
   * reached: it answered, immediately, and what it said was not this often. Borrowing
   * "check your connection" for it would send somebody to fix a working connection. */
  it("says too fast when the instance is metering, and carries the wait", async () => {
    const server = instance(() =>
      Response.json(
        { error: "not that fast", retryAfter: 12, scope: "ip" },
        { status: TOO_MANY }
      )
    );

    const arrival = await lookUp(ID, server);

    expect(arrival.state).toBe("too-fast");
    expect(arrival.retryAfter).toBe(12);
  });
});

describe("spend", () => {
  it("hands back the ciphertext the instance was holding", async () => {
    const made = await sealed();
    const server = instance(() => Response.json({ ...made.stored }));

    const spent = await spend(made.id, server);

    expect(spent.status).toBe("held");
    expect(spent.status === "held" && spent.envelope).toStrictEqual(
      made.stored.envelope
    );
  });

  it("never sends the key or a password with the press", async () => {
    const made = await sealed("northwind");
    const server = instance(() => Response.json({ ...made.stored }));

    await spend(made.id, server);

    const asked = await sent(server.asked);
    expect(asked).not.toContain(made.fragmentToken);
    expect(asked).not.toContain("northwind");
    expect(server.asked).toHaveLength(1);
  });

  it("presses once, and the press carries no body at all", async () => {
    const made = await sealed();
    const server = instance(() => Response.json({ ...made.stored }));

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

  /* The one refused press that costs nothing. It never reached the claim, so the link
   * is untouched, and reporting it as a dead end would destroy a live secret on screen
   * while the instance still held it. */
  it("says too fast without spending anything, and carries the wait", async () => {
    const server = instance(() =>
      Response.json(
        { error: "not that fast", retryAfter: 30, scope: "ip" },
        { status: TOO_MANY }
      )
    );

    const spent = await spend(ID, server);

    expect(spent.status).toBe("too-fast");
    expect(spent.status === "too-fast" && spent.retryAfter).toBe(30);
  });

  it("hands back the attachments that came with the envelope", async () => {
    const made = await sealedWithFile();
    const server = instance(() => Response.json({ ...made.stored }));

    const spent = await spend(made.id, server);

    expect(spent.status === "held" && spent.attachments).toStrictEqual(
      made.stored.attachments
    );
  });

  it("hands back an empty list for a secret that carried no files", async () => {
    const made = await sealed();
    const server = instance(() => Response.json({ ...made.stored }));

    const spent = await spend(made.id, server);

    expect(spent.status === "held" && spent.attachments).toStrictEqual([]);
  });

  /* No files is an empty list, never a missing one. So an answer without the field
   * is one this browser cannot read rather than a secret with nothing attached:
   * being lenient here is how a note whose file went astray would open looking
   * whole. There is no older instance to be lenient towards either. */
  it("says nothing answered when the attachments are missing entirely", async () => {
    const made = await sealedWithFile();
    const server = instance(() =>
      Response.json({ envelope: made.stored.envelope, id: made.id })
    );

    expect((await spend(made.id, server)).status).toBe("unreachable");
  });

  /* An answer this browser cannot read is not a dead secret, and it is not half a
   * secret either. It reads as nothing having answered, the same as an unreadable
   * status does, rather than as an envelope missing its files. */
  it("says nothing answered when the attachments are not attachments", async () => {
    const made = await sealedWithFile();
    const server = instance(() =>
      Response.json({
        attachments: [{ index: "first" }],
        envelope: made.stored.envelope,
        id: made.id,
      })
    );

    expect((await spend(made.id, server)).status).toBe("unreachable");
  });
});

describe("unseal", () => {
  it("opens an envelope that needs no password", async () => {
    const made = await sealed();

    const opened = await unseal({
      attachments: [],
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
      attachments: [],
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
      attachments: [],
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
      attachments: [],
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
      attachments: [],
      envelope: made.stored.envelope,
      id: newSecretId(),
      token: keyOf(made.fragmentToken),
    });

    expect(opened.status).toBe("closed");
  });

  it("opens the file that came back with the envelope", async () => {
    const made = await sealedWithFile();

    const opened = await unseal({
      attachments: made.stored.attachments,
      envelope: made.stored.envelope,
      id: made.id,
      token: keyOf(made.fragmentToken),
    });

    expect(opened.status === "open" && opened.secret.files).toStrictEqual([
      {
        bytes: PROFILE,
        name: "northwind-vpn-profile.ovpn",
        size: PROFILE.length,
        type: "application/x-openvpn-profile",
      },
    ]);
  });

  /* An envelope opens as one thing. Handing over the note while the file it names
   * is missing would be a partial secret that reads as a whole one. */
  it("stays shut when the envelope names a file that did not come back", async () => {
    const made = await sealedWithFile();

    const opened = await unseal({
      attachments: [],
      envelope: made.stored.envelope,
      id: made.id,
      token: keyOf(made.fragmentToken),
    });

    expect(opened.status).toBe("closed");
  });
});

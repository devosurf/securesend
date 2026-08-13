import { openEnvelope } from "@securesend/crypto/envelope";
import { decodeFragmentToken } from "@securesend/crypto/fragment";
import { afterEach, describe, expect, it } from "vitest";
import type { SlackContext } from "../slack/payload";
import {
  MAX_ATTACHMENTS,
  MAX_ENVELOPE_BYTES,
  MAX_TOTAL_BYTES,
  SendFailedError,
  sealAndSend,
} from "./seal-and-send";

/*
 * The sender's whole crossing from plaintext to a link, driven at its own
 * boundary with a fake instance on the other side.
 *
 * What this is really here to prove is the one promise the product makes: what
 * leaves this module over the wire is ciphertext, and the key is in the link and
 * nowhere else. Every other test in here exists because it would be a way for
 * that to stop being true without anybody noticing.
 */

const ORIGIN = "https://securesend.dev";
const CREATED = 201;
const CONFLICT = 409;
const TOO_LARGE = 413;
const TOO_MANY = 429;
const SERVER_ERROR = 500;

/** The iv's length in base64url characters, which the api's schema fixes. */
const IV_CHARS = 16;

/* A day out, and reckoned from now rather than written down. This browser forgets
 * what it sent a week past its expiry, so a fixed date makes the memory tests pass
 * for a week and then fail forever. */
const DAY_MS = 86_400_000;
const EXPIRES = new Date(Date.now() + DAY_MS).toISOString();

function created(id: string, managementToken = "a-management-token") {
  return Response.json(
    { expiresAt: EXPIRES, id, managementToken },
    { status: CREATED }
  );
}

function instance(reply: (attempt: number) => Response) {
  const asked: Request[] = [];

  const fetch: typeof globalThis.fetch = (input, init) => {
    asked.push(new Request(input as string, init));
    return Promise.resolve(reply(asked.length - 1));
  };

  return { asked, fetch };
}

function memory() {
  const held = new Map<string, string>();

  return {
    getItem: (key: string) => held.get(key) ?? null,
    held,
    setItem: (key: string, value: string) => {
      held.set(key, value);
    },
  };
}

/** Everything the fake instance was told, as the text it was told it in. */
async function sent(asked: Request[]) {
  const bodies = await Promise.all(
    asked.map((request) => request.clone().text())
  );
  return bodies.join("\n");
}

function around(reply: (attempt: number) => Response) {
  const server = instance(reply);
  const storage = memory();

  return { server, storage, world: { ...server, origin: ORIGIN, storage } };
}

/** A file to attach, filled with something recognisable rather than zeroes. */
function file(name: string, size: number, type = "application/octet-stream") {
  const bytes = new Uint8Array(new ArrayBuffer(size));
  bytes.fill(name.charCodeAt(0));

  return { bytes, name, type };
}

describe("sealAndSend", () => {
  it("hands back a link that carries the key after its hash", async () => {
    const { world } = around((attempt) => created(`id-${attempt}`));

    const link = await sealAndSend(
      { expiry: "24h", note: "the door code is 4417" },
      world
    );

    const [address, key] = link.href.split("#");
    expect(address).toBe(`${ORIGIN}/s/${link.id}`);
    expect(key ?? "").not.toBe("");
    expect(link.shown).toBe(`securesend.dev/s/${link.id}#${key}`);
    expect(link.expiresAt).toBe(EXPIRES);
  });

  it("posts the ciphertext and the things the api asks for, and nothing else", async () => {
    const { server, world } = around((attempt) => created(`id-${attempt}`));

    await sealAndSend({ expiry: "1h", note: "hunter2" }, world);

    const body = JSON.parse(await sent(server.asked)) as {
      envelope: { ciphertext: string; iv: string };
      expiry: string;
      id: string;
    };

    expect(Object.keys(body).toSorted()).toStrictEqual([
      "attachments",
      "envelope",
      "expiry",
      "id",
    ]);
    expect(Object.keys(body.envelope).toSorted()).toStrictEqual([
      "ciphertext",
      "iv",
    ]);
    expect(body.expiry).toBe("1h");
    expect(body.envelope.iv).toHaveLength(IV_CHARS);
    expect(body.envelope.ciphertext).not.toContain("hunter2");
  });

  it("never lets the key reach the request", async () => {
    const { server, world } = around((attempt) => created(`id-${attempt}`));

    const link = await sealAndSend(
      {
        credentials: { password: "s3cret", username: "ada" },
        expiry: "72h",
        note: "vpn is up",
        password: "correct horse",
      },
      world
    );
    const key = link.href.split("#")[1] ?? "";

    const asked = await sent(server.asked);
    expect(key).not.toBe("");
    expect(asked).not.toContain(key);
    expect(asked).not.toContain("correct horse");
    expect(asked).not.toContain("s3cret");
    expect(asked).not.toContain("vpn is up");
  });

  it("never lets the key reach this browser's memory", async () => {
    const { storage, world } = around((attempt) => created(`id-${attempt}`));

    const link = await sealAndSend(
      { expiry: "24h", note: "the door code is 4417", password: "hunter2" },
      world
    );
    const key = link.href.split("#")[1] ?? "";

    const kept = [...storage.held.values()].join("\n");
    expect(kept).not.toBe("");
    expect(kept).not.toContain(key);
    expect(kept).not.toContain("hunter2");
    expect(kept).not.toContain("4417");
  });

  it("remembers the id and the management token, so this device can watch it", async () => {
    const { storage, world } = around(() =>
      created("ignored", "the-management-token")
    );

    const link = await sealAndSend({ expiry: "24h", note: "hi" }, world);

    const kept = JSON.parse(
      storage.held.get("securesend.sent") ?? "[]"
    ) as unknown[];
    expect(kept).toStrictEqual([
      {
        expiresAt: EXPIRES,
        id: link.id,
        managementToken: "the-management-token",
      },
    ]);
  });

  it("keeps what it already remembered, newest first", async () => {
    const { storage, world } = around((attempt) => created(`id-${attempt}`));

    const first = await sealAndSend({ expiry: "24h", note: "one" }, world);
    const second = await sealAndSend({ expiry: "24h", note: "two" }, world);

    const kept = JSON.parse(storage.held.get("securesend.sent") ?? "[]") as {
      id: string;
    }[];
    expect(kept.map((held) => held.id)).toStrictEqual([second.id, first.id]);
  });

  it("seals again under a fresh id when the instance says the id is taken", async () => {
    const { server, world } = around((attempt) =>
      attempt === 0
        ? Response.json({ error: "that id is taken" }, { status: CONFLICT })
        : created("ignored")
    );

    const link = await sealAndSend({ expiry: "24h", note: "hi" }, world);

    const ids = await Promise.all(
      server.asked.map(async (request) => {
        const body = (await request.clone().json()) as { id: string };
        return body.id;
      })
    );
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect(link.id).toBe(ids[1]);
  });

  it("gives up rather than sealing forever against a broken instance", async () => {
    const { server, world } = around(() =>
      Response.json({ error: "that id is taken" }, { status: CONFLICT })
    );

    await expect(
      sealAndSend({ expiry: "24h", note: "hi" }, world)
    ).rejects.toThrow(SendFailedError);
    expect(server.asked.length).toBeLessThan(10);
  });

  it("refuses more text than the cap without asking the instance at all", async () => {
    const { server, world } = around(() => created("never"));

    const failure = await sealAndSend(
      { expiry: "24h", note: "x".repeat(MAX_ENVELOPE_BYTES + 1) },
      world
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SendFailedError);
    expect((failure as SendFailedError).problem).toBe("too-big");
    expect(server.asked).toHaveLength(0);
  });

  it("counts every part against the cap, not just the note", async () => {
    const { world } = around(() => created("never"));
    const half = "x".repeat(Math.ceil(MAX_ENVELOPE_BYTES / 2));

    await expect(
      sealAndSend(
        {
          credentials: { password: half, username: half },
          expiry: "24h",
          note: half,
        },
        world
      )
    ).rejects.toThrow(SendFailedError);
  });

  it("reports the instance's own cap when the instance is the one refusing", async () => {
    const { world } = around(() =>
      Response.json({ error: "too big", limit: 4096 }, { status: TOO_LARGE })
    );

    const failure = (await sealAndSend(
      { expiry: "24h", note: "hi" },
      world
    ).catch((error: unknown) => error)) as SendFailedError;

    expect(failure.problem).toBe("too-big");
    expect(failure.limit).toBe(4096);
  });

  it("says the instance refused it when the instance refuses it", async () => {
    const { world } = around(() =>
      Response.json({ error: "no" }, { status: SERVER_ERROR })
    );

    const failure = (await sealAndSend(
      { expiry: "24h", note: "hi" },
      world
    ).catch((error: unknown) => error)) as SendFailedError;

    expect(failure.problem).toBe("refused");
  });

  /*
   * The two paces, told apart, because one asks the sender to slow down and the other
   * says it is not about them. Getting this backwards would blame somebody for the
   * instance being full, which is the one thing a refusal here must not do.
   */
  it("says too fast when this caller is the one at their limit", async () => {
    const { world } = around(() =>
      Response.json(
        { error: "not that fast", retryAfter: 42, scope: "ip" },
        { status: TOO_MANY }
      )
    );

    const failure = (await sealAndSend(
      { expiry: "24h", note: "hi" },
      world
    ).catch((error: unknown) => error)) as SendFailedError;

    expect(failure.problem).toBe("too-fast");
    expect(failure.retryAfter).toBe(42);
  });

  it("says the instance is busy when the instance is the one at its limit", async () => {
    const { world } = around(() =>
      Response.json(
        { error: "at its limit", retryAfter: 7, scope: "instance" },
        { status: TOO_MANY }
      )
    );

    const failure = (await sealAndSend(
      { expiry: "24h", note: "hi" },
      world
    ).catch((error: unknown) => error)) as SendFailedError;

    expect(failure.problem).toBe("instance-busy");
    expect(failure.retryAfter).toBe(7);
  });

  /* A 429 can come from a proxy in front of the instance, which knows nothing about this
   * product's shapes. The wait still comes off the standard header, and the sentence
   * names no cause: saying the instance was full when it was a network in between would
   * be asserting something this tab has no way to know. */
  it("names no cause when the refusal named none, and reads the header", async () => {
    const { world } = around(
      () =>
        new Response("<html>too many requests</html>", {
          headers: { "retry-after": "90" },
          status: TOO_MANY,
        })
    );

    const failure = (await sealAndSend(
      { expiry: "24h", note: "hi" },
      world
    ).catch((error: unknown) => error)) as SendFailedError;

    expect(failure.problem).toBe("limited");
    expect(failure.retryAfter).toBe(90);
  });

  it("keeps the secret in this tab when it is refused for pace", async () => {
    const { server, storage, world } = around(() =>
      Response.json({ retryAfter: 30, scope: "ip" }, { status: TOO_MANY })
    );

    await expect(
      sealAndSend({ expiry: "24h", note: "hi" }, world)
    ).rejects.toThrow();

    // Nothing was stored anywhere, so there is nothing to burn and nothing to watch:
    // the sender still holds the only copy and pressing again is the whole recovery.
    expect(storage.held.size).toBe(0);
    expect(server.asked).toHaveLength(1);
  });

  it("says nothing answered when nothing answers", async () => {
    const failure = (await sealAndSend(
      { expiry: "24h", note: "hi" },
      {
        fetch: () => Promise.reject(new Error("offline")),
        origin: ORIGIN,
        storage: memory(),
      }
    ).catch((error: unknown) => error)) as SendFailedError;

    expect(failure.problem).toBe("unreachable");
  });

  it("refuses to send an envelope with nothing in it", async () => {
    const { server, world } = around(() => created("never"));

    await expect(sealAndSend({ expiry: "24h" }, world)).rejects.toThrow();
    expect(server.asked).toHaveLength(0);
  });

  /* The whole crossing, end to end: what the instance was given plus what the
   * sender was given open to exactly what was typed, whitespace and all. */
  it("seals what the sender typed, and nothing else", async () => {
    const { server, world } = around((attempt) => created(`id-${attempt}`));

    const link = await sealAndSend(
      {
        credentials: { password: "s3cret", username: "ada" },
        expiry: "24h",
        note: "  padded\n",
        password: "correct horse",
      },
      world
    );

    const posted = JSON.parse(await sent(server.asked)) as {
      envelope: { ciphertext: string; iv: string };
    };
    const read = decodeFragmentToken(link.href.split("#")[1] ?? "");
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }

    const opened = await openEnvelope({
      password: "correct horse",
      stored: { attachments: [], envelope: posted.envelope, id: link.id },
      token: read.token,
    });

    expect(opened).toStrictEqual({
      credentials: { password: "s3cret", username: "ada" },
      files: [],
      note: "  padded\n",
    });
  });
});

/*
 * Files, which are the one part of an envelope with a name on it.
 *
 * The name, the size and the type go inside the envelope's own ciphertext and the
 * bytes go out as separate ciphertexts, so what the instance is handed is a
 * numbered list of opaque blobs. That is the whole reason this seam is tested:
 * "the server never sees a filename" is a claim about a request body, and this is
 * where the request body is made.
 */
describe("sealAndSend, with files", () => {
  it("posts one ciphertext per file, numbered from zero", async () => {
    const { server, world } = around((attempt) => created(`id-${attempt}`));

    await sealAndSend(
      {
        expiry: "24h",
        files: [file("ca.pem", 128), file("vpn.ovpn", 256)],
        note: "the profile is attached",
      },
      world
    );

    const body = JSON.parse(await sent(server.asked)) as {
      attachments: { ciphertext: string; index: number; iv: string }[];
    };

    expect(body.attachments.map((one) => one.index)).toStrictEqual([0, 1]);
    for (const one of body.attachments) {
      expect(Object.keys(one).toSorted()).toStrictEqual([
        "ciphertext",
        "index",
        "iv",
      ]);
      expect(one.iv).toHaveLength(IV_CHARS);
    }
  });

  /* The claim on the homepage is that the instance never holds a filename. This
   * is the request that would break it, so this is where it is asserted. */
  it("never lets a filename reach the request", async () => {
    const { server, world } = around((attempt) => created(`id-${attempt}`));

    await sealAndSend(
      {
        expiry: "24h",
        files: [
          file("northwind-vpn-profile.ovpn", 64, "application/x-openvpn"),
        ],
        note: "hi",
      },
      world
    );

    const asked = await sent(server.asked);
    expect(asked).not.toContain("northwind-vpn-profile");
    expect(asked).not.toContain(".ovpn");
    expect(asked).not.toContain("application/x-openvpn");
  });

  it("posts nothing about files when there are none", async () => {
    const { server, world } = around((attempt) => created(`id-${attempt}`));

    await sealAndSend({ expiry: "24h", files: [], note: "hi" }, world);

    const body = JSON.parse(await sent(server.asked)) as {
      attachments: unknown[];
    };
    expect(body.attachments).toStrictEqual([]);
  });

  /* The whole crossing with a file in it: what the instance was given plus what
   * the sender was given open to the same bytes and the same name. */
  it("seals the bytes, and hands the name only to whoever opens it", async () => {
    const { server, world } = around((attempt) => created(`id-${attempt}`));
    const attached = file("recovery-codes.txt", 512, "text/plain");

    const link = await sealAndSend(
      { expiry: "24h", files: [attached], note: "codes" },
      world
    );

    const posted = JSON.parse(await sent(server.asked)) as {
      attachments: { ciphertext: string; index: number; iv: string }[];
      envelope: { ciphertext: string; iv: string };
    };
    const read = decodeFragmentToken(link.href.split("#")[1] ?? "");
    if (read.status !== "ok") {
      throw new Error("the link did not carry a key");
    }

    const opened = await openEnvelope({
      stored: {
        attachments: posted.attachments,
        envelope: posted.envelope,
        id: link.id,
      },
      token: read.token,
    });

    expect(opened.files).toStrictEqual([
      {
        bytes: attached.bytes,
        name: "recovery-codes.txt",
        size: 512,
        type: "text/plain",
      },
    ]);
  });

  it("counts the files against the cap on the whole secret", async () => {
    const { server, world } = around(() => created("never"));

    const failure = (await sealAndSend(
      { expiry: "24h", files: [file("backup.zip", MAX_TOTAL_BYTES + 1)] },
      world
    ).catch((error: unknown) => error)) as SendFailedError;

    expect(failure.problem).toBe("files-too-big");
    expect(failure.limit).toBe(MAX_TOTAL_BYTES);
    expect(server.asked).toHaveLength(0);
  });

  /* Two files that each fit and together do not are exactly what a per-file limit
   * waves through, which is why the mirrored cap is a total like the instance's. */
  it("adds the files up rather than measuring them one at a time", async () => {
    const { world } = around(() => created("never"));
    const half = Math.ceil(MAX_TOTAL_BYTES / 2);

    await expect(
      sealAndSend(
        { expiry: "24h", files: [file("a", half), file("b", half)] },
        world
      )
    ).rejects.toThrow(SendFailedError);
  });

  it("refuses more files than one envelope carries, and asks nothing", async () => {
    const { server, world } = around(() => created("never"));
    const many = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_unused, at) =>
      file(`part-${at}`, 8)
    );

    const failure = (await sealAndSend(
      { expiry: "24h", files: many },
      world
    ).catch((error: unknown) => error)) as SendFailedError;

    expect(failure.problem).toBe("too-many-files");
    expect(server.asked).toHaveLength(0);
  });

  it("sends an envelope that is only a file", async () => {
    const { world } = around((attempt) => created(`id-${attempt}`));

    const link = await sealAndSend(
      { expiry: "24h", files: [file("ca.pem", 64)] },
      world
    );

    expect(link.href).toContain("#");
  });
});

/*
 * The crossing a sender makes from a Slack channel.
 *
 * Two things fetch here and they are deliberately not the same thing. The
 * instance's client is handed in, so the fake instance above sees the ciphertext.
 * Slack is posted to by the browser itself, so it lands on the global, and the
 * separation in this file is the separation the claim is made of: the channel gets
 * the key, and the instance holding the secret never does.
 */
describe("sealAndSend, from a Slack channel", () => {
  const CONTEXT: SlackContext = {
    channelId: "C024BE91L",
    channelName: "eng-infra",
    issuedAt: 1_700_000_000_000,
    responseUrl: "https://hooks.slack.com/commands/T0001/1234/abcd",
    senderName: "Marta Ek",
    teamId: "T0001",
  };

  const real = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = real;
  });

  /** Everything the browser posted to Slack itself, rather than through the api. */
  function slack(): string[] {
    const posted: string[] = [];

    globalThis.fetch = (_input, init) => {
      posted.push(String(init?.body ?? ""));
      return Promise.resolve(new Response(null, { status: 200 }));
    };

    return posted;
  }

  it("posts the finished link to the channel, and the key nowhere else", async () => {
    const posted = slack();
    const { server, world } = around((attempt) => created(`id-${attempt}`));

    const link = await sealAndSend(
      { expiry: "24h", note: "the door code is 4417" },
      { ...world, slack: { ...CONTEXT, issuedAt: Date.now() } }
    );
    const key = link.href.split("#")[1] ?? "";

    expect(key).not.toBe("");
    expect(await sent(server.asked)).not.toContain(key);
    expect(posted).toHaveLength(2);
    expect(posted.filter((body) => body.includes(key))).toHaveLength(1);
  });

  it("posts nothing to Slack when the sender came from nowhere", async () => {
    const posted = slack();
    const { world } = around((attempt) => created(`id-${attempt}`));

    await sealAndSend({ expiry: "24h", note: "hi" }, world);

    expect(posted).toStrictEqual([]);
  });

  it("posts nothing once the channel's reply handle is past its window", async () => {
    const posted = slack();
    const { world } = around((attempt) => created(`id-${attempt}`));

    const link = await sealAndSend(
      { expiry: "24h", note: "hi" },
      { ...world, slack: CONTEXT }
    );

    // The link is still made and still handed back. It just goes nowhere by itself.
    expect(link.href).toContain("#");
    expect(posted).toStrictEqual([]);
  });
});

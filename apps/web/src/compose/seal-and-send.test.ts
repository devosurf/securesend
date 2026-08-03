import { openEnvelope } from "@securesend/crypto/envelope";
import { decodeFragmentToken } from "@securesend/crypto/fragment";
import { describe, expect, it } from "vitest";
import {
  MAX_ENVELOPE_BYTES,
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
const SERVER_ERROR = 500;

/** The iv's length in base64url characters, which the api's schema fixes. */
const IV_CHARS = 16;

const EXPIRES = "2026-08-04T12:00:00.000Z";

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

  it("posts the ciphertext and the three things the api asks for", async () => {
    const { server, world } = around((attempt) => created(`id-${attempt}`));

    await sealAndSend({ expiry: "1h", note: "hunter2" }, world);

    const body = JSON.parse(await sent(server.asked)) as {
      envelope: { ciphertext: string; iv: string };
      expiry: string;
      id: string;
    };

    expect(Object.keys(body).toSorted()).toStrictEqual([
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

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sealEnvelope } from "@securesend/crypto/envelope";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkName, presetFor, run } from "./run";

/*
 * A secret into a command's environment, against an instance that is a function
 * and a child process that is real.
 *
 * The child has to be real, because what is being asserted is the one guarantee
 * this command makes: the plaintext arrives in the process's environment and
 * nowhere else. A stubbed spawn would be asserting our own call.
 */

const ORIGIN = "https://instance.test";
const NOTE = "postgres://user:pa55word@db.internal/app";

/** The name the child looks under, chosen so no real environment carries it. */
const VARIABLE = "SECURESEND_TEST_VALUE";

/** Writes whatever that variable holds to the path it was given, or nothing. */
const WRITES_THE_VARIABLE = `require('node:fs').writeFileSync(process.argv[1], process.env.${VARIABLE} ?? '')`;

interface Call {
  body: unknown;
  url: string;
}

function textOf(body: RequestInit["body"]): unknown {
  if (typeof body !== "string") {
    return null;
  }

  const parsed: unknown = JSON.parse(body);

  return parsed;
}

function json(body: unknown, status: number): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

async function instanceHolding(note: string, hours: number) {
  const sealed = await sealEnvelope({ note });
  const created = new Date("2026-08-13T09:00:00.000Z");
  const state = {
    burnedAt: null,
    burnReason: null,
    createdAt: created.toISOString(),
    expiresAt: new Date(created.getTime() + hours * 3_600_000).toISOString(),
    id: sealed.stored.id,
    state: "sealed",
    usedAt: null,
  };

  const calls: Call[] = [];
  const instance = vi.fn(
    (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      calls.push({ body: textOf(init?.body), url });

      if (url.endsWith("/reveal")) {
        return json(
          {
            attachments: sealed.stored.attachments,
            envelope: sealed.stored.envelope,
            id: sealed.stored.id,
          },
          200
        );
      }
      if (url.endsWith("/api/secrets")) {
        return json(
          {
            expiresAt: state.expiresAt,
            id: sealed.stored.id,
            managementToken: "a-management-token",
          },
          201
        );
      }

      return json(state, 200);
    }
  );

  vi.stubGlobal("fetch", instance);

  return {
    calls,
    link: `${ORIGIN}/s/${sealed.stored.id}#${sealed.fragmentToken}`,
  };
}

function creates(calls: readonly Call[]): readonly Call[] {
  return calls.filter((call) => call.url.endsWith("/api/secrets"));
}

let directory = "";
let said: { mock: { calls: readonly unknown[][] } } = { mock: { calls: [] } };

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "securesend-cli-"));
  vi.stubEnv("SECURESEND_URL", "");
  said = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("presetFor", () => {
  it("reads back the preset a secret was made with", () => {
    expect(presetFor("2026-08-13T09:00:00Z", "2026-08-13T10:00:00Z")).toBe(
      "1h"
    );
    expect(presetFor("2026-08-13T09:00:00Z", "2026-08-14T09:00:00Z")).toBe(
      "24h"
    );
    expect(presetFor("2026-08-13T09:00:00Z", "2026-08-16T09:00:00Z")).toBe(
      "72h"
    );
  });

  it("rounds off the seconds a round trip through a database costs", () => {
    expect(presetFor("2026-08-13T09:00:00Z", "2026-08-13T10:00:04Z")).toBe(
      "1h"
    );
  });

  it("takes the default rather than guessing at a lifetime it cannot read", () => {
    expect(presetFor("2026-08-13T09:00:00Z", "2026-08-13T17:00:00Z")).toBe(
      "24h"
    );
    expect(presetFor("nonsense", "also nonsense")).toBe("24h");
  });
});

describe("checkName", () => {
  it("takes the names a shell will pass on", () => {
    expect(checkName("DATABASE_URL")).toBe("DATABASE_URL");
    expect(checkName("_x1")).toBe("_x1");
  });

  it("refuses anything else, before the link is spent", () => {
    expect(() => checkName("1BAD")).toThrow("--as");
    expect(() => checkName("HAS-A-DASH")).toThrow("--as");
    expect(() => checkName("")).toThrow("--as");
  });
});

describe("run", () => {
  it("puts the secret in the child's environment and exits with its code", async () => {
    const { calls, link } = await instanceHolding(NOTE, 24);
    const seen = join(directory, "seen.txt");

    const code = await run(link, ["node", "-e", WRITES_THE_VARIABLE, seen], {
      as: VARIABLE,
      reseal: true,
    });

    expect(code).toBe(0);
    expect(await readFile(seen, "utf8")).toBe(NOTE);
    expect(creates(calls)).toHaveLength(0);
  });

  it("hands the secret to no other name", async () => {
    const { link } = await instanceHolding(NOTE, 24);
    const seen = join(directory, "seen.txt");

    await run(link, ["node", "-e", WRITES_THE_VARIABLE, seen], {
      as: "SOMETHING_ELSE",
      reseal: true,
    });

    expect(await readFile(seen, "utf8")).toBe("");
  });

  it("reseals under a fresh key when the command fails", async () => {
    const { calls, link } = await instanceHolding(NOTE, 1);

    const code = await run(link, ["node", "-e", "process.exit(3)"], {
      as: VARIABLE,
      reseal: true,
    });

    expect(code).toBe(3);

    const posted = creates(calls);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.body).toMatchObject({ expiry: "1h" });

    const receipt = said.mock.calls
      .map((call) => String(call[0] ?? ""))
      .join("");
    expect(receipt).toContain("command failed; the secret was resealed:");
    expect(receipt).not.toContain(NOTE);
  });

  it("lets the secret go when told not to reseal", async () => {
    const { calls, link } = await instanceHolding(NOTE, 24);

    const code = await run(link, ["node", "-e", "process.exit(2)"], {
      as: VARIABLE,
      reseal: false,
    });

    expect(code).toBe(2);
    expect(creates(calls)).toHaveLength(0);
  });

  it("returns one for a command that is not there, and reseals", async () => {
    const { calls, link } = await instanceHolding(NOTE, 24);

    const code = await run(link, ["no-such-command-anywhere"], {
      as: VARIABLE,
      reseal: true,
    });

    expect(code).toBe(1);
    expect(creates(calls)).toHaveLength(1);
  });
});

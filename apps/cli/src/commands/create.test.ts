import { afterEach, describe, expect, it, vi } from "vitest";
import { create, expiryOf } from "./create";

/*
 * The sender's crossing, with the instance replaced by a function.
 *
 * What is worth asserting here is not that a fetch happened. It is that the key
 * stayed out of every request, that one line and only one line reached stdout,
 * and that a taken id costs a fresh secret rather than a failure.
 */

const ORIGIN = "https://instance.test";

interface Posted {
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

function idOf(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "id" in body &&
    typeof body.id === "string"
  ) {
    return body.id;
  }

  throw new Error("that body carried no id");
}

function answering(refusals: number) {
  const posted: Posted[] = [];
  let left = refusals;

  const instance = vi.fn(
    (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const body = textOf(init?.body);
      posted.push({ body, url: String(input) });

      if (left > 0) {
        left -= 1;

        return Promise.resolve(
          new Response(JSON.stringify({ error: "that id is taken" }), {
            status: 409,
          })
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            expiresAt: "2026-08-14T12:00:00.000Z",
            id: idOf(body),
            managementToken: "a-management-token",
          }),
          { status: 201 }
        )
      );
    }
  );

  vi.stubGlobal("fetch", instance);

  return posted;
}

/** Everything one of the two channels was handed, in order. */
function said(spy: { mock: { calls: readonly unknown[][] } }): string {
  return spy.mock.calls.map((call) => String(call[0] ?? "")).join("");
}

function watching() {
  return {
    err: vi.spyOn(process.stderr, "write").mockImplementation(() => true),
    out: vi.spyOn(process.stdout, "write").mockImplementation(() => true),
  };
}

describe("expiryOf", () => {
  it("takes the three the api takes", () => {
    expect(expiryOf("1h")).toBe("1h");
    expect(expiryOf("72h")).toBe("72h");
  });

  it("refuses a fourth", () => {
    expect(() => expiryOf("7d")).toThrow("1h, 24h or 72h");
  });
});

describe("create", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prints the link alone on stdout and the receipt on stderr", async () => {
    const posted = answering(0);
    const { err, out } = watching();

    const code = await create({
      expiry: "24h",
      file: [],
      instance: ORIGIN,
      text: "the secret",
    });

    expect(code).toBe(0);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.url).toBe(`${ORIGIN}/api/secrets`);

    const printed = said(out);
    const id = idOf(posted[0]?.body);
    expect(printed).toMatch(
      new RegExp(`^${ORIGIN}/s/${id}#[A-Za-z0-9_-]+\\n$`)
    );

    const receipt = said(err);
    expect(receipt).toContain("expires 2026-08-14T12:00:00.000Z");
    expect(receipt).toContain(
      `burn with: securesend burn ${ORIGIN}/s/${id} --token a-management-token`
    );
  });

  it("seals a whole new secret when the instance says the id is taken", async () => {
    const posted = answering(2);
    watching();

    await create({
      expiry: "1h",
      file: [],
      instance: ORIGIN,
      text: "the secret",
    });

    expect(posted).toHaveLength(3);
    expect(new Set(posted.map((post) => idOf(post.body))).size).toBe(3);
  });

  it("gives up rather than hammering an instance that takes no id", async () => {
    answering(Number.POSITIVE_INFINITY);
    watching();

    await expect(
      create({ expiry: "24h", file: [], instance: ORIGIN, text: "the secret" })
    ).rejects.toThrow("would take no id");
  });

  it("puts the key in the link and in nothing that was sent", async () => {
    const posted = answering(1);
    const { err, out } = watching();

    await create({
      expiry: "24h",
      file: [],
      instance: ORIGIN,
      text: "the secret",
    });

    const fragment = said(out).trim().split("#").at(-1) ?? "";
    expect(fragment).not.toBe("");

    for (const post of posted) {
      expect(JSON.stringify(post.body)).not.toContain(fragment);
    }
    expect(said(err)).not.toContain(fragment);
  });
});

import { describe, expect, it } from "vitest";
import { type Kept, remember, type SentSecret } from "./remember";

/*
 * What this browser keeps about what it sent, driven at the only boundary it has:
 * the json under one storage key.
 *
 * The forgetting is the part worth pinning down. It is a promise the product makes
 * to senders in as many words, and it is enforced on write rather than on a clock,
 * so nothing else in the app would notice if it stopped happening.
 */

const KEY = "securesend.sent";

const DAY_MS = 86_400_000;

const NOW = Date.parse("2026-08-03T12:00:00.000Z");

function daysFromNow(days: number): string {
  return new Date(NOW + days * DAY_MS).toISOString();
}

function memory(start?: string) {
  const held = new Map<string, string>();
  if (start !== undefined) {
    held.set(KEY, start);
  }

  const kept: Kept = {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => {
      held.set(key, value);
    },
  };

  return { held, kept };
}

function sent(id: string, expiresIn: number): SentSecret {
  return {
    expiresAt: daysFromNow(expiresIn),
    id,
    managementToken: `token-${id}`,
  };
}

function idsIn(held: Map<string, string>): string[] {
  const rows = JSON.parse(held.get(KEY) ?? "[]") as SentSecret[];

  return rows.map((row) => row.id);
}

describe("remember", () => {
  it("keeps one row per id, with the newest of them first", () => {
    const { held, kept } = memory();

    remember(sent("first", 1), kept, NOW);
    remember(sent("second", 1), kept, NOW);
    remember(sent("first", 1), kept, NOW);

    expect(idsIn(held)).toStrictEqual(["first", "second"]);
  });

  it("forgets a row a week past its expiry, which is when its tombstone goes", () => {
    const { held, kept } = memory();

    remember(sent("long-dead", -8), kept, NOW);
    remember(sent("fresh", 1), kept, NOW);

    expect(idsIn(held)).toStrictEqual(["fresh"]);
  });

  it("keeps a row that expired inside the week, because it still has an answer", () => {
    const { held, kept } = memory();

    remember(sent("expired-tuesday", -6), kept, NOW);
    remember(sent("fresh", 1), kept, NOW);

    expect(idsIn(held)).toStrictEqual(["fresh", "expired-tuesday"]);
  });

  it("starts over when what is under the key is not ours", () => {
    const { held, kept } = memory("not json at all");

    remember(sent("fresh", 1), kept, NOW);

    expect(idsIn(held)).toStrictEqual(["fresh"]);
  });

  it("drops rows that are not shaped like ours and keeps the ones that are", () => {
    const { held, kept } = memory(
      JSON.stringify([{ id: "half a row" }, sent("whole", 1)])
    );

    remember(sent("fresh", 1), kept, NOW);

    expect(idsIn(held)).toStrictEqual(["fresh", "whole"]);
  });

  /* A browser in private mode, or with storage switched off, or simply full. The
   * sender loses the history, never the link, so this may not throw. */
  it("says nothing when the browser refuses to remember", () => {
    const refusing: Kept = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };

    expect(() => remember(sent("fresh", 1), refusing, NOW)).not.toThrow();
  });
});

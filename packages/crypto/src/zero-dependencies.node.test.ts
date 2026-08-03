import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = join(import.meta.dirname, "..");
const sourceRoot = join(packageRoot, "src");

const SPECIFIER = /(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;
const RELATIVE = /^\.\.?\//;

function manifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
}

function shippedSources(): string[] {
  return readdirSync(sourceRoot, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
}

function specifiersIn(source: string): string[] {
  return [...source.matchAll(SPECIFIER)].map(
    ([, specifier]) => specifier ?? ""
  );
}

// AGENTS.md: a dependency appearing in this package is a policy failure. These
// tests are what makes that sentence true instead of hopeful.
describe("zero runtime dependencies", () => {
  it.each(["dependencies", "peerDependencies", "optionalDependencies"])(
    "declares no %s",
    (field) => {
      expect(manifest()[field] ?? {}).toStrictEqual({});
    }
  );

  it("imports nothing but its own files", () => {
    for (const file of shippedSources()) {
      const source = readFileSync(join(sourceRoot, file), "utf8");

      for (const specifier of specifiersIn(source)) {
        expect(specifier, `${file} imports ${specifier}`).toMatch(RELATIVE);
      }
    }
  });
});

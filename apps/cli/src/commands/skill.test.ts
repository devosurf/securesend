import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { skillText } from "../skill-text";
import { skill } from "./skill";

/*
 * The one test that keeps `securesend skill` and the repository's own document
 * from ever being two documents. It reads the file off disk and compares it with
 * what the import inlined, so an edit to one without the other reddens here.
 */

const SKILL = fileURLToPath(
  new URL("../../../../skills/securesend/SKILL.md", import.meta.url)
);

describe("skill", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the document this repository ships, byte for byte", async () => {
    const said = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    const code = skill();
    const printed = said.mock.calls
      .map((call) => String(call[0] ?? ""))
      .join("");

    expect(code).toBe(0);
    expect(skillText).toBe(await readFile(SKILL, "utf8"));
    expect(printed).toBe(skillText);
  });
});

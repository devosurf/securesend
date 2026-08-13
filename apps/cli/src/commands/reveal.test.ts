import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OpenedFile } from "@securesend/crypto/envelope";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeName, writeAttachments } from "./reveal";

/*
 * Where an attachment lands.
 *
 * The reveal has already happened by the time any of this runs, so the property
 * under test is that nothing here loses a file: a name chosen by a stranger is
 * made safe rather than refused, and a name already taken costs a suffix rather
 * than somebody else's file.
 */

function attachment(name: string, body: string): OpenedFile {
  const bytes = new TextEncoder().encode(body);

  return { bytes, name, size: bytes.length, type: "" };
}

let directory = "";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "securesend-cli-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("safeName", () => {
  it("keeps a name a filesystem can take", () => {
    expect(safeName("report.pdf", 0)).toBe("report.pdf");
    expect(safeName(".env", 0)).toBe(".env");
  });

  it("keeps only the last segment, so a name cannot be a path", () => {
    expect(safeName("../../etc/passwd", 0)).toBe("passwd");
    expect(safeName("C:\\Users\\me\\key.pem", 0)).toBe("key.pem");
  });

  it("keeps letters that are not this keyboard's", () => {
    expect(safeName("rapport-å.pdf", 0)).toBe("rapport-å.pdf");
  });

  it("numbers a name there is nothing left of", () => {
    expect(safeName("", 0)).toBe("attachment-0");
    expect(safeName("..", 2)).toBe("attachment-2");
    expect(safeName("///", 1)).toBe("attachment-1");
  });
});

describe("writeAttachments", () => {
  it("writes every file and reports none lost", async () => {
    const failures = await writeAttachments(
      [attachment("one.txt", "first"), attachment("two.txt", "second")],
      directory
    );

    expect(failures).toBe(0);
    expect(await readFile(join(directory, "one.txt"), "utf8")).toBe("first");
    expect(await readFile(join(directory, "two.txt"), "utf8")).toBe("second");
  });

  it("suffixes rather than replacing a file already there", async () => {
    await writeFile(join(directory, "key.pem"), "somebody else's");

    const failures = await writeAttachments(
      [attachment("key.pem", "ours")],
      directory
    );

    expect(failures).toBe(0);
    expect(await readFile(join(directory, "key.pem"), "utf8")).toBe(
      "somebody else's"
    );
    expect(await readFile(join(directory, "key-1.pem"), "utf8")).toBe("ours");
  });

  it("suffixes two attachments that arrived under one name", async () => {
    const failures = await writeAttachments(
      [
        attachment("key.pem", "first"),
        attachment("key.pem", "second"),
        attachment("key.pem", "third"),
      ],
      directory
    );

    expect(failures).toBe(0);
    expect(await readFile(join(directory, "key.pem"), "utf8")).toBe("first");
    expect(await readFile(join(directory, "key-1.pem"), "utf8")).toBe("second");
    expect(await readFile(join(directory, "key-2.pem"), "utf8")).toBe("third");
  });

  it("suffixes a name with no extension without inventing one", async () => {
    await writeFile(join(directory, "id_rsa"), "somebody else's");

    await writeAttachments([attachment("id_rsa", "ours")], directory);

    expect(await readFile(join(directory, "id_rsa-1"), "utf8")).toBe("ours");
  });

  it("makes a directory that is not there yet", async () => {
    const nested = join(directory, "secrets", "today");

    await writeAttachments([attachment("one.txt", "first")], `${nested}/`);

    expect(await readdir(nested)).toEqual(["one.txt"]);
  });

  it("takes a single file's whole name from --out", async () => {
    await writeAttachments(
      [attachment("whatever.bin", "first")],
      join(directory, "chosen.txt")
    );

    expect(await readFile(join(directory, "chosen.txt"), "utf8")).toBe("first");
  });

  it("treats --out as a directory once there is more than one file", async () => {
    const nested = join(directory, "several");

    await writeAttachments(
      [attachment("one.txt", "first"), attachment("two.txt", "second")],
      nested
    );

    expect((await readdir(nested)).sort()).toEqual(["one.txt", "two.txt"]);
  });
});

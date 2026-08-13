import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  DecryptionFailedError,
  type OpenedEnvelope,
  type OpenedFile,
  openEnvelope,
  type StoredEnvelope,
} from "@securesend/crypto/envelope";
import type { FragmentToken } from "@securesend/crypto/fragment";
import { revealSecret } from "../client";
import { instanceForLink } from "../instance";
import { parseLink } from "../link";
import { askHidden, askPassword, atTheKeyboard } from "../prompt";

/*
 * Spending a link and putting what comes out where a human can use it.
 *
 * This is the irreversible one. The instance hands the ciphertext over exactly
 * once and forgets it in the same transaction, so from the moment that request
 * answers, the only copy of the secret is in this process. Everything after that
 * point is written to keep it: a wrong password costs a retype rather than the
 * secret, and a name that is already taken on disk costs a suffix rather than an
 * error and a lost file.
 *
 * The text goes to stdout, which is what makes this the command to avoid when a
 * command could have the secret instead. `securesend run` exists so the
 * plaintext never has to be here at all.
 */

/** Three tries, because the ciphertext is already here and a retry is free. */
const PASSWORD_TRIES = 3;

/** How far a name is allowed to walk before this gives up on placing it. */
const SUFFIX_ATTEMPTS = 100;

/**
 * What a name may keep. Written as what is allowed rather than what is not,
 * because the list of characters that break a filesystem, a shell or a terminal
 * is open-ended and this one is not: letters and digits in any script, and the
 * few marks that carry meaning in a filename.
 */
const KEPT = /[^\p{L}\p{N}._@+ -]/gu;

const SEPARATORS = /[/\\]/;

const ONLY_DOTS = /^\.+$/;

const ENDS_IN_SEPARATOR = /[/\\]$/;

export interface RevealOptions {
  instance?: string | undefined;
  out?: string | undefined;
}

export interface Placed {
  path: string;
  wrote: boolean;
}

/**
 * Opens what this process is holding, asking again when a password is wrong.
 *
 * The retry is free and worth offering out loud: the instance has already
 * forgotten this secret, so the ciphertext in memory is all there is and trying
 * a different password costs nothing but the typing. Only at a keyboard, and
 * only when a password is what is missing: a wrong key in the link cannot be
 * typed around.
 */
export async function openWith(
  stored: StoredEnvelope,
  token: FragmentToken,
  password: string | undefined,
  left: number = PASSWORD_TRIES
): Promise<OpenedEnvelope> {
  try {
    return await openEnvelope({ password, stored, token });
  } catch (error) {
    if (!(error instanceof DecryptionFailedError)) {
      throw error;
    }
    if (!(token.needsPassword && atTheKeyboard() && left > 1)) {
      throw new Error(
        "that did not open: the password, or the key in the link, is not this secret's",
        { cause: error }
      );
    }

    process.stderr.write(
      "wrong password; the ciphertext is already here, try again\n"
    );

    return await openWith(
      stored,
      token,
      await askHidden("Password: "),
      left - 1
    );
  }
}

/**
 * A name chosen by a stranger, made safe to write. Only the last segment
 * survives, so a path inside an envelope is a path this program will not follow,
 * and a name that is nothing but dots is a name that could climb out of the
 * directory it was given.
 */
export function safeName(name: string, index: number): string {
  const last = name.split(SEPARATORS).at(-1) ?? "";
  const cleaned = last.replace(KEPT, "-").trim();

  /* Numbered by the position the envelope gave it, which is the only thing left
   * to tell two nameless attachments apart by. */
  return cleaned === "" || ONLY_DOTS.test(cleaned)
    ? `attachment-${index}`
    : cleaned;
}

async function isDirectory(path: string): Promise<boolean> {
  const found = await stat(path).catch(() => null);

  return found?.isDirectory() === true;
}

/**
 * What `--out` meant. A directory when it is one, when it is written like one, or
 * when there is more than one file to put somewhere. Otherwise it names the
 * single file, which is the only case where naming a file is unambiguous.
 */
async function placeFor(
  out: string | undefined,
  count: number
): Promise<{ directory: string; name?: string }> {
  if (out === undefined) {
    return { directory: process.cwd() };
  }
  if (ENDS_IN_SEPARATOR.test(out) || count !== 1 || (await isDirectory(out))) {
    return { directory: out };
  }

  return { directory: dirname(out), name: basename(out) };
}

function takenAlready(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  const { code } = error;

  return code === "EEXIST";
}

/**
 * Writes one file without ever replacing another. `wx` is the whole guarantee:
 * the look and the create are one syscall, so a name that appears in between
 * still cannot be overwritten. What is being written is the only copy of a
 * secret, and what is already there is somebody's file.
 */
async function place(
  directory: string,
  name: string,
  bytes: Uint8Array<ArrayBuffer>
): Promise<Placed> {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";

  async function at(suffix: number): Promise<Placed> {
    const path = join(
      directory,
      suffix === 0 ? `${stem}${extension}` : `${stem}-${suffix}${extension}`
    );

    try {
      await writeFile(path, bytes, { flag: "wx" });

      return { path, wrote: true };
    } catch (error) {
      if (takenAlready(error) && suffix < SUFFIX_ATTEMPTS) {
        return await at(suffix + 1);
      }

      return { path, wrote: false };
    }
  }

  return await at(0);
}

/**
 * Every attachment onto disk, and a count of the ones that did not make it.
 *
 * Recursive because the names have to be claimed one after another: two files
 * placed at once would both find the same name free. Nothing here throws, for
 * the reason at the top of this file: the reveal has already happened, so a file
 * that cannot be written is a line to say so and a reason to keep going.
 */
export async function writeAttachments(
  files: readonly OpenedFile[],
  out: string | undefined
): Promise<number> {
  const where = await placeFor(out, files.length);

  try {
    await mkdir(where.directory, { recursive: true });
  } catch {
    process.stderr.write(`could not make ${where.directory}\n`);

    return files.length;
  }

  async function next(index: number, failures: number): Promise<number> {
    const file = files[index];
    if (file === undefined) {
      return failures;
    }

    const placed = await place(
      where.directory,
      where.name ?? safeName(file.name, index),
      file.bytes
    );

    process.stderr.write(
      placed.wrote
        ? `wrote ${placed.path}\n`
        : `could not write ${placed.path}\n`
    );

    return await next(index + 1, placed.wrote ? failures : failures + 1);
  }

  return await next(0, 0);
}

export async function reveal(
  link: string,
  options: RevealOptions
): Promise<number> {
  const secret = parseLink(link);
  if (secret.key.status !== "ok") {
    throw new Error("this link arrived without a usable key");
  }

  const { token } = secret.key;
  const origin = instanceForLink(secret.origin, options.instance);

  /* Before the request, not after. A password that cannot be had is a reason to
   * stop while the secret is still there to come back for. */
  const password = token.needsPassword ? await askPassword() : undefined;

  const answer = await revealSecret(origin, secret.id);
  if (answer.status === "gone") {
    process.stderr.write(`that link is already ${answer.state.state}\n`);

    return 1;
  }

  const opened = await openWith(answer.secret, token, password);

  /* The note is written back with the newline `create` took off it, so a secret
   * that went in through a pipe comes out the way it went in. */
  if (opened.note !== undefined) {
    process.stdout.write(`${opened.note}\n`);
  }
  if (opened.credentials !== undefined) {
    process.stdout.write(`username: ${opened.credentials.username}\n`);
    process.stdout.write(`password: ${opened.credentials.password}\n`);
  }

  const failures = await writeAttachments(opened.files, options.out);

  return failures === 0 ? 0 : 1;
}

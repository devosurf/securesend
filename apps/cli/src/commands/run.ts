import { spawn } from "node:child_process";
import type {
  EnvelopeParts,
  OpenedEnvelope,
} from "@securesend/crypto/envelope";
import { type Expiry, revealSecret, statusOf } from "../client";
import { instanceForLink } from "../instance";
import { parseLink } from "../link";
import { askPassword } from "../prompt";
import { burnLine, type Sending, type Shared, sealAndSend } from "./create";
import { openWith } from "./reveal";

/*
 * Handing a secret to a command without it ever being in the transcript.
 *
 * This is the verb that exists so `reveal` does not have to be used. The
 * plaintext is allowed in exactly one place, the child process's environment,
 * and nowhere else: not in the argument list, which every other process on the
 * machine can read, not on stdout, and not in any message this file writes.
 *
 * A reveal cannot be undone, so a failed command must not cost the secret. The
 * status is read first, so a link that is already spent costs nothing to find
 * out about, and a command that exits non-zero gets the plaintext resealed under
 * a fresh key and posted again. The new link is the only thing said out loud.
 */

/** An hour in milliseconds, which is the unit the three presets are counted in. */
const HOUR_MS = 3_600_000;

/** The environment variable names a shell will actually pass on. */
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Exit code for a child that was killed rather than one that finished. */
const KILLED = 1;

const PRESETS: Record<number, Expiry> = {
  1: "1h",
  24: "24h",
  72: "72h",
};

export interface RunOptions {
  as: string;
  instance?: string | undefined;
  reseal: boolean;
}

interface Finished {
  /** Null when the child was killed by a signal or never started at all. */
  code: number | null;
}

/**
 * Which preset this secret was made with, read back off its own timestamps.
 *
 * A reseal should not quietly change a secret's lifetime, and the api does not
 * say which preset a secret was created under. Both timestamps come from the
 * database's own clock and the three presets are hours apart, so rounding
 * recovers the answer. Anything that does not round onto one of them was not
 * made by this product's own form, and gets the default rather than a guess.
 */
export function presetFor(createdAt: string, expiresAt: string): Expiry {
  const hours = Math.round(
    (Date.parse(expiresAt) - Date.parse(createdAt)) / HOUR_MS
  );

  return PRESETS[hours] ?? "24h";
}

export function checkName(name: string): string {
  if (!VARIABLE_NAME.test(name)) {
    throw new Error(
      "--as takes an environment variable name: letters, digits and underscores, not starting with a digit"
    );
  }

  return name;
}

/**
 * The one shape this command can carry. A file has no environment variable to
 * become and a login is two values for one slot, so anything else is refused
 * here rather than half-injected. It is refused after the reveal, which is why
 * the caller reseals rather than simply stopping.
 */
function textOnly(opened: OpenedEnvelope): string | null {
  if (
    opened.note === undefined ||
    opened.credentials !== undefined ||
    opened.files.length > 0
  ) {
    return null;
  }

  return opened.note;
}

/** Everything that came out, so nothing is dropped on the way back in. */
function partsOf(opened: OpenedEnvelope): EnvelopeParts {
  return {
    ...(opened.credentials !== undefined && {
      credentials: opened.credentials,
    }),
    ...(opened.files.length > 0 && { files: opened.files }),
    ...(opened.note !== undefined && { note: opened.note }),
  };
}

/**
 * The child, and the only place the plaintext is allowed to be. `inherit`
 * because the command is the point: its output is this session's output, and
 * nothing between it and the terminal reads what it prints.
 */
function runCommand(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
): Promise<Finished> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, stdio: "inherit" });

    child.on("error", () => resolve({ code: null }));
    child.on("exit", (code, signal) =>
      resolve({ code: signal === null ? code : null })
    );
  });
}

/**
 * Posting the secret back, with one retry. Two attempts because the first
 * failure is usually a moment of network and the second is a real one, and
 * because the thing being retried is a create: nothing was shared in between.
 */
async function resealTwice(sending: Sending): Promise<Shared | null> {
  try {
    return await sealAndSend(sending);
  } catch {
    try {
      return await sealAndSend(sending);
    } catch {
      return null;
    }
  }
}

/**
 * Puts the secret back and says where it went. The admission when that fails is
 * plain and carries nothing: a message holding the plaintext would be the one
 * place this command promised never to put it.
 */
async function reseal(why: string, sending: Sending): Promise<void> {
  const shared = await resealTwice(sending);

  if (shared === null) {
    process.stderr.write(`${why}; could not reseal, so the secret is gone\n`);

    return;
  }

  process.stderr.write(`${why}; the secret was resealed: ${shared.href}\n`);
  process.stderr.write(
    `${burnLine(sending.origin, shared.id, shared.managementToken)}\n`
  );
}

export async function run(
  link: string,
  argv: readonly string[],
  options: RunOptions
): Promise<number> {
  const name = checkName(options.as);
  const secret = parseLink(link);
  if (secret.key.status !== "ok") {
    throw new Error("this link arrived without a usable key");
  }

  const { token } = secret.key;
  const origin = instanceForLink(secret.origin, options.instance);

  /* Asked before anything is spent. A link somebody else already read should
   * cost nothing at all to discover, and this route touches nothing. */
  const state = await statusOf(origin, secret.id);
  if (state.state !== "sealed") {
    process.stderr.write(`that link is ${state.state}; nothing was consumed\n`);

    return 1;
  }

  const expiry = presetFor(state.createdAt, state.expiresAt);
  const password = token.needsPassword ? await askPassword() : undefined;

  const answer = await revealSecret(origin, secret.id);
  if (answer.status === "gone") {
    process.stderr.write(
      `that link is ${answer.state.state}; nothing was consumed\n`
    );

    return 1;
  }

  const opened = await openWith(answer.secret, token, password);
  const sending = { expiry, origin, parts: partsOf(opened), password };
  const note = textOnly(opened);

  if (note === null) {
    if (options.reseal) {
      await reseal("not a text secret; use reveal", sending);
    } else {
      process.stderr.write("not a text secret; use reveal\n");
    }

    return 1;
  }

  const [command, ...args] = argv;
  if (command === undefined) {
    throw new Error("nothing to run: put the command after --");
  }

  const finished = await runCommand(command, args, {
    ...process.env,
    [name]: note,
  });
  const code = finished.code ?? KILLED;

  if (code !== 0 && options.reseal) {
    await reseal("command failed", sending);
  }

  return code;
}

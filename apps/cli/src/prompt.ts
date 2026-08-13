import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

/*
 * Asking for something that must not be echoed.
 *
 * A password and a management token are the two things this program asks a human
 * for, and neither may appear on the screen, in a scrollback buffer, or in a
 * shell's history. The password is never a flag carrying a value either, because
 * argv is readable by every other process on the machine. The management token
 * does ride a flag, deliberately: it can only destroy, never read, and `create`
 * already prints it as a ready-made burn command.
 *
 * The echo stops by giving readline nowhere to write. In terminal mode the
 * terminal itself draws nothing and readline redraws every keystroke, so an
 * output that discards what it is given leaves the line blank while still
 * reading it. The question goes to stderr by hand, because stdout carries a link
 * or a secret and nothing else.
 */

export const PASSWORD_VARIABLE = "SECURESEND_PASSWORD";

/** Whether there is anybody at a keyboard to be asked. */
export function atTheKeyboard(): boolean {
  return process.stdin.isTTY === true;
}

/** Whatever readline wants to echo, dropped. */
function silence(): Writable {
  return new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
}

/**
 * One answer, never drawn. An interrupted prompt answers with nothing rather
 * than leaving the promise open: every caller treats an empty answer as a
 * refusal, and the terminal gets its raw mode back on the way out either way.
 */
export async function askHidden(question: string): Promise<string> {
  process.stderr.write(question);

  const asking = createInterface({
    input: process.stdin,
    output: silence(),
    terminal: true,
  });
  const abandoned = new Promise<string>((resolve) => {
    asking.on("close", () => resolve(""));
  });

  try {
    return await Promise.race([asking.question(""), abandoned]);
  } finally {
    asking.close();
    process.stdin.pause();
    process.stderr.write("\n");
  }
}

/**
 * The password an envelope needs, from the keyboard or from the environment.
 * Headless it can only come from the environment, and the message says which
 * variable rather than leaving somebody to guess at a flag that does not exist.
 */
export async function askPassword(): Promise<string> {
  if (atTheKeyboard()) {
    const typed = await askHidden("Password: ");
    if (typed === "") {
      throw new Error("no password was given");
    }

    return typed;
  }

  const configured = process.env[PASSWORD_VARIABLE];
  if (configured === undefined || configured === "") {
    throw new Error(
      `nothing here is attached to a keyboard, so the password has to arrive in ${PASSWORD_VARIABLE}`
    );
  }

  return configured;
}

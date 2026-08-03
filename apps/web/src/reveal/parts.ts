import type { OpenedEnvelope } from "@securesend/crypto/envelope";

/*
 * What an open envelope is made of, as rows and as one block of text.
 *
 * Both readings are here rather than in the screen, because the take control and the
 * rows have to agree about what "everything" means: a bar that says it took the note
 * and the login, over a panel showing only a note, would be the one screen in the
 * product whose job is to be believed telling a small lie.
 *
 * An absent part is absent, not empty. A sender who typed only a note gets one row,
 * and the sentence under the bar names one thing.
 */

export interface Part {
  label: string;
  masked?: boolean;
  tone?: "mono" | "prose";
  value: string;
  /** The value may be read off the screen and typed by hand. See CopyRow. */
  verbatim?: boolean;
}

export function partsOf(secret: OpenedEnvelope): Part[] {
  const parts: Part[] = [];

  if (secret.note !== undefined) {
    parts.push({ label: "note", tone: "prose", value: secret.note });
  }
  if (secret.credentials) {
    parts.push({ label: "username", value: secret.credentials.username });
    parts.push({
      label: "password",
      masked: true,
      value: secret.credentials.password,
      verbatim: true,
    });
  }

  return parts;
}

/**
 * Everything that goes on a clipboard, as one block of text, labelled the way
 * somebody would say it aloud. Empty when the secret was only files.
 *
 * The note comes first and whole, then the pair on a line each, because what lands on
 * the clipboard is usually pasted straight into a chat or a note app where a label is
 * the only thing telling the two apart. Files are not in here: they go to the disk,
 * and a filename on a clipboard would be a name with no file behind it.
 */
export function allOf(secret: OpenedEnvelope): string {
  const blocks: string[] = [];

  if (secret.note !== undefined) {
    blocks.push(secret.note);
  }
  if (secret.credentials) {
    blocks.push(
      `username: ${secret.credentials.username}\npassword: ${secret.credentials.password}`
    );
  }

  return blocks.join("\n\n");
}

/**
 * Whether one press is worth offering at all. With a single row the row's own Copy
 * or Download already is one press, and a second control doing the same thing
 * would be the bar claiming work it is not doing.
 *
 * A file counts as a row here even though it is not a Part: the two go to
 * different places, and taking them in one gesture is the whole idea.
 */
export function worthTaking(secret: OpenedEnvelope): boolean {
  return partsOf(secret).length + secret.files.length > 1;
}

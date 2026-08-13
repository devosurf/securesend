/*
 * Which instance a command talks to.
 *
 * Two rules, because the two kinds of command know different things. A link
 * carries the origin it was made on, and that origin is part of the link rather
 * than a default: a self-hoster with SECURESEND_URL set still receives links
 * from other instances, and asking their own instance about somebody else's
 * link would answer "nothing there" about a secret that exists. So for a link,
 * only an explicit --instance overrides, for the one machine whose route to an
 * instance is not the address the links carry. Creating has no link to read, so
 * it takes the flag, then the variable a self-hoster set once, then ours.
 */

export const HOSTED_INSTANCE = "https://securesend.dev";

/** Spelled once, because the message that names it has to name the same one. */
export const INSTANCE_VARIABLE = "SECURESEND_URL";

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

const HTTP = new Set(["http:", "https:"]);

/** The first choice anybody actually made. An unset variable is an empty one. */
function chosen(
  ...choices: readonly (string | undefined)[]
): string | undefined {
  return choices.find((choice) => choice !== undefined && choice.trim() !== "");
}

/**
 * An address with nothing after the host. The scheme is filled in because a
 * hostname typed by hand rarely has one, and a trailing slash is dropped because
 * every url built from this adds its own: a double slash is a path some proxies
 * answer and some redirect.
 */
export function asOrigin(value: string): string {
  const text = value.trim();
  const whole = SCHEME.test(text) ? text : `https://${text}`;

  if (!URL.canParse(whole)) {
    throw new Error("that is not an address an instance could live at");
  }

  const url = new URL(whole);
  if (!HTTP.has(url.protocol)) {
    throw new Error("an instance is reached over http or https");
  }

  return url.origin;
}

/** Where a new secret goes when nothing was said: ours. */
export function instanceForCreate(
  flag: string | undefined,
  configured: string | undefined
): string {
  return asOrigin(chosen(flag, configured) ?? HOSTED_INSTANCE);
}

/** Where a link is asked about: where it says, unless a flag says otherwise. */
export function instanceForLink(
  fromLink: string,
  flag: string | undefined
): string {
  return asOrigin(chosen(flag) ?? fromLink);
}

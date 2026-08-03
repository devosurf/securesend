import { base64urlToBytes, bytesToBase64url } from "./base64url";
import { randomBytes } from "./random";

/**
 * The fragment token is everything the recipient's browser needs and the server
 * must never have, fused into one opaque blob:
 *
 *     byte 0        version
 *     byte 1        flags, bit 0 set when a password protects the envelope
 *     bytes 2..33   the 256-bit key
 *     bytes 34..49  the 128-bit KDF salt, present only with that flag
 *
 * 34 bytes plain, 50 with a salt: 46 or 67 base64url characters after the `#`.
 * The flag rides here rather than in server metadata, so the server cannot tell
 * which envelopes are password-protected.
 */
export const FRAGMENT_TOKEN_VERSION = 1;

export const FRAGMENT_KEY_BYTES = 32;

export const FRAGMENT_SALT_BYTES = 16;

const PASSWORD_FLAG = 0x01;
const KEY_OFFSET = 2;
const SALT_OFFSET = KEY_OFFSET + FRAGMENT_KEY_BYTES;
const PLAIN_BYTES = SALT_OFFSET;
const PASSWORD_BYTES = SALT_OFFSET + FRAGMENT_SALT_BYTES;

/**
 * A password token always has its salt and a plain one never does, so the two
 * cannot be mixed up by construction.
 */
export type FragmentToken =
  | { needsPassword: false; key: Uint8Array<ArrayBuffer> }
  | {
      needsPassword: true;
      key: Uint8Array<ArrayBuffer>;
      salt: Uint8Array<ArrayBuffer>;
    };

/**
 * `incomplete` is the recipient-facing state for a link that arrived without a
 * usable key: nothing to request, nothing destroyed, a fix to teach. Decoding
 * reports it rather than throwing, because it is an ordinary thing for a link
 * to survive a chat client badly.
 */
export type FragmentTokenResult =
  | { status: "ok"; token: FragmentToken }
  | { status: "incomplete" };

/** A fresh result each time, so nothing a caller does can reach the next one. */
function incomplete(): FragmentTokenResult {
  return { status: "incomplete" };
}

export function newFragmentToken(needsPassword: boolean): FragmentToken {
  const key = randomBytes(FRAGMENT_KEY_BYTES);

  return needsPassword
    ? { key, needsPassword: true, salt: randomBytes(FRAGMENT_SALT_BYTES) }
    : { key, needsPassword: false };
}

export function encodeFragmentToken(token: FragmentToken): string {
  const bytes = new Uint8Array(
    token.needsPassword ? PASSWORD_BYTES : PLAIN_BYTES
  );

  bytes[0] = FRAGMENT_TOKEN_VERSION;
  bytes[1] = token.needsPassword ? PASSWORD_FLAG : 0;
  bytes.set(token.key, KEY_OFFSET);
  if (token.needsPassword) {
    bytes.set(token.salt, SALT_OFFSET);
  }

  return bytesToBase64url(bytes);
}

/**
 * Reads a fragment token, or says the link is incomplete. Every check is a way
 * a real link gets damaged: truncated by a chat client, re-wrapped, a character
 * dropped. What it cannot see is a substitution inside the key, because the
 * format carries no checksum; that one fails at decryption instead, which is
 * still closed. Nothing here reports why, and nothing here quotes the input.
 */
export function decodeFragmentToken(encoded: string): FragmentTokenResult {
  let bytes: Uint8Array;
  try {
    bytes = base64urlToBytes(encoded);
  } catch {
    return incomplete();
  }

  const [version, flags] = bytes;

  if (version !== FRAGMENT_TOKEN_VERSION) {
    return incomplete();
  }
  if (flags !== 0 && flags !== PASSWORD_FLAG) {
    return incomplete();
  }

  const needsPassword = flags === PASSWORD_FLAG;
  if (bytes.length !== (needsPassword ? PASSWORD_BYTES : PLAIN_BYTES)) {
    return incomplete();
  }

  const key = bytes.slice(KEY_OFFSET, SALT_OFFSET);

  return {
    status: "ok",
    token: needsPassword
      ? { key, needsPassword: true, salt: bytes.slice(SALT_OFFSET) }
      : { key, needsPassword: false },
  };
}

import { base64urlToBytes, bytesToBase64url } from "./base64url";
import { randomBytes } from "./random";

/** 128 bits. The client picks ids, so they have to be unguessable on their own. */
export const SECRET_ID_BYTES = 16;

/** What those 16 bytes look like in a link: 22 base64url characters. */
export const SECRET_ID_LENGTH = 22;

export function newSecretId(): string {
  return bytesToBase64url(randomBytes(SECRET_ID_BYTES));
}

/**
 * Whether this could be an id we generated. Strict on purpose: it decodes with
 * the same reader the fragment token uses, so a string that survives here is
 * one `newSecretId` could have produced, down to the unused bits in the last
 * character. Everything else is a typo or a truncated link.
 */
export function isSecretId(value: string): boolean {
  if (value.length !== SECRET_ID_LENGTH) {
    return false;
  }

  try {
    base64urlToBytes(value);
    return true;
  } catch {
    return false;
  }
}

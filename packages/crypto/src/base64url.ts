const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Encodes bytes as base64url with no padding. */
export function bytesToBase64url(input: Uint8Array): string {
  let encoded = "";

  for (let index = 0; index < input.length; index += 3) {
    const first = input[index] ?? 0;
    const second = input[index + 1] ?? 0;
    const third = input[index + 2] ?? 0;
    const block = (first << 16) | (second << 8) | third;
    const bytesLeft = input.length - index;

    encoded += ALPHABET.charAt((block >> 18) & 63);
    encoded += ALPHABET.charAt((block >> 12) & 63);
    if (bytesLeft > 1) {
      encoded += ALPHABET.charAt((block >> 6) & 63);
    }
    if (bytesLeft > 2) {
      encoded += ALPHABET.charAt(block & 63);
    }
  }

  return encoded;
}

/**
 * Decodes unpadded base64url. Throws on anything the encoder could not have
 * produced. The messages never quote the input: this decoder reads the
 * fragment token, and the key must not reach a log or an error report.
 */
export function base64urlToBytes(input: string): Uint8Array {
  // A base64url block is 2, 3 or 4 characters. One leftover character is junk.
  if (input.length % 4 === 1) {
    throw new Error("not base64url: incomplete");
  }

  const decoded = new Uint8Array(Math.floor((input.length * 3) / 4));
  let writeAt = 0;
  let buffer = 0;
  let bufferedBits = 0;

  for (const character of input) {
    const value = ALPHABET.indexOf(character);
    if (value === -1) {
      throw new Error("not base64url: unexpected character");
    }

    buffer = (buffer << 6) | value;
    bufferedBits += 6;

    if (bufferedBits >= 8) {
      bufferedBits -= 8;
      decoded[writeAt] = (buffer >> bufferedBits) & 0xff;
      writeAt += 1;
    }
  }

  return decoded;
}

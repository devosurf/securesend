import { describe, expect, it } from "vitest";
import { base64urlToBytes, bytesToBase64url } from "./base64url";
import {
  decodeFragmentToken,
  encodeFragmentToken,
  FRAGMENT_KEY_BYTES,
  FRAGMENT_SALT_BYTES,
  FRAGMENT_TOKEN_VERSION,
  type FragmentToken,
  newFragmentToken,
} from "./fragment";

/** Narrows a decode that the test expects to succeed. */
function decoded(encoded: string): FragmentToken {
  const result = decodeFragmentToken(encoded);

  if (result.status !== "ok") {
    throw new Error("expected this token to decode");
  }

  return result.token;
}

function encodedBytes(needsPassword: boolean): Uint8Array {
  return base64urlToBytes(encodeFragmentToken(newFragmentToken(needsPassword)));
}

function withByte(
  source: Uint8Array,
  offset: number,
  value: number
): Uint8Array {
  const copy = Uint8Array.from(source);
  copy[offset] = value;
  return copy;
}

describe("newFragmentToken", () => {
  it("carries a 256 bit key", () => {
    expect(FRAGMENT_KEY_BYTES).toBe(32);
    expect(newFragmentToken(false).key).toHaveLength(FRAGMENT_KEY_BYTES);
  });

  it("carries a 128 bit salt only when a password protects the envelope", () => {
    expect(FRAGMENT_SALT_BYTES).toBe(16);

    const sealed = newFragmentToken(true);
    if (!sealed.needsPassword) {
      throw new Error("expected a password token");
    }

    expect(sealed.salt).toHaveLength(FRAGMENT_SALT_BYTES);
    expect(newFragmentToken(false)).not.toHaveProperty("salt");
  });

  it("draws a fresh key every time", () => {
    const keys = new Set(
      Array.from({ length: 200 }, () =>
        bytesToBase64url(newFragmentToken(false).key)
      )
    );

    expect(keys.size).toBe(200);
  });
});

describe("encodeFragmentToken", () => {
  // The lengths a real secret link has to carry. Copy truncation in the receipt
  // is designed against these two numbers.
  it("is 46 characters without a password and 67 with one", () => {
    expect(encodeFragmentToken(newFragmentToken(false))).toHaveLength(46);
    expect(encodeFragmentToken(newFragmentToken(true))).toHaveLength(67);
  });

  it("lays out version, flags, key, then salt", () => {
    const token = newFragmentToken(true);
    if (!token.needsPassword) {
      throw new Error("expected a password token");
    }
    const bytes = base64urlToBytes(encodeFragmentToken(token));

    expect(bytes).toHaveLength(50);
    expect(bytes[0]).toBe(FRAGMENT_TOKEN_VERSION);
    expect(bytes[1]).toBe(1);
    expect(bytes.subarray(2, 34)).toStrictEqual(token.key);
    expect(bytes.subarray(34, 50)).toStrictEqual(token.salt);
  });

  it("clears the password flag when no password protects the envelope", () => {
    const bytes = encodedBytes(false);

    expect(bytes).toHaveLength(34);
    expect(bytes[1]).toBe(0);
  });
});

describe("decodeFragmentToken", () => {
  it("round-trips a token with no password", () => {
    const token = newFragmentToken(false);

    expect(decoded(encodeFragmentToken(token))).toStrictEqual(token);
  });

  it("round-trips a token with a password", () => {
    const token = newFragmentToken(true);

    expect(decoded(encodeFragmentToken(token))).toStrictEqual(token);
  });

  it("reads a link that lost its fragment as incomplete", () => {
    expect(decodeFragmentToken("")).toStrictEqual({ status: "incomplete" });
  });

  it.each([false, true])(
    "reads every truncation as incomplete (password: %o)",
    (needsPassword) => {
      const encoded = encodeFragmentToken(newFragmentToken(needsPassword));

      for (let length = 0; length < encoded.length; length += 1) {
        expect(
          decodeFragmentToken(encoded.slice(0, length)),
          `truncated to ${length}`
        ).toStrictEqual({ status: "incomplete" });
      }
    }
  );

  // The worst case for truncation: a password token cut to exactly the length
  // of a plain one. The flags byte survives the cut and says a salt should be
  // here, so the pairing is what catches it.
  it("reads a password token cut down to a plain token's length as incomplete", () => {
    const cut = encodeFragmentToken(newFragmentToken(true)).slice(0, 46);

    expect(decodeFragmentToken(cut)).toStrictEqual({ status: "incomplete" });
  });

  it("reads anything longer than the format as incomplete", () => {
    for (const needsPassword of [false, true]) {
      const bytes = encodedBytes(needsPassword);
      const longer = new Uint8Array(bytes.length + 1);
      longer.set(bytes);

      expect(decodeFragmentToken(bytesToBase64url(longer))).toStrictEqual({
        status: "incomplete",
      });
    }
  });

  it("reads a version it does not know as incomplete", () => {
    const bytes = encodedBytes(false);

    for (const version of [0, 2, 255]) {
      expect(
        decodeFragmentToken(bytesToBase64url(withByte(bytes, 0, version)))
      ).toStrictEqual({ status: "incomplete" });
    }
  });

  it("reads a flag it does not know as incomplete", () => {
    const bytes = encodedBytes(false);

    for (const flags of [0x02, 0x80, 0xff]) {
      expect(
        decodeFragmentToken(bytesToBase64url(withByte(bytes, 1, flags)))
      ).toStrictEqual({ status: "incomplete" });
    }
  });

  it("reads a salt without its flag as incomplete", () => {
    const bytes = encodedBytes(true);

    expect(
      decodeFragmentToken(bytesToBase64url(withByte(bytes, 1, 0)))
    ).toStrictEqual({ status: "incomplete" });
  });

  it("reads a flag without its salt as incomplete", () => {
    const bytes = encodedBytes(false);

    expect(
      decodeFragmentToken(bytesToBase64url(withByte(bytes, 1, 1)))
    ).toStrictEqual({ status: "incomplete" });
  });

  it("reads characters outside base64url as incomplete", () => {
    const encoded = encodeFragmentToken(newFragmentToken(false));

    for (const junk of ["+", "/", "=", " ", "#", "é"]) {
      expect(
        decodeFragmentToken(`${encoded.slice(0, -1)}${junk}`)
      ).toStrictEqual({ status: "incomplete" });
    }
  });

  // 46 characters hold 276 bits and the token is 272, so the last character
  // leaves 4 bits at zero and only four characters can end a token. Every other
  // ending is a character that got corrupted on the way here.
  it("reads bits the encoder never sets as incomplete", () => {
    const encoded = encodeFragmentToken(newFragmentToken(false));

    expect("AQgw").toContain(encoded.slice(-1));

    for (const last of ["B", "C", "R", "h", "x", "-", "_"]) {
      expect(
        decodeFragmentToken(`${encoded.slice(0, -1)}${last}`)
      ).toStrictEqual({ status: "incomplete" });
    }
  });

  /*
   * The one corruption the format cannot see. Substituting a character inside
   * the key keeps every length, the version and the flags intact, and the token
   * has no checksum to fail: 34 bytes is the layout the spec fixes, and 46
   * characters is the link length it promises. So a flipped key byte decodes,
   * and AES-GCM is what refuses it a moment later. `envelope.test.ts` holds
   * that half: a wrong key fails closed, never into a wrong plaintext.
   */
  it("cannot see a substitution inside the key, and leaves that to GCM", () => {
    const token = newFragmentToken(false);
    const bytes = base64urlToBytes(encodeFragmentToken(token));
    const flipped = withByte(bytes, 2, (bytes[2] ?? 0) ^ 0xff);

    expect(decoded(bytesToBase64url(flipped)).key).not.toStrictEqual(token.key);
  });

  // Whatever a mutation does, it must not produce a second spelling of a token.
  it("only ever accepts the one spelling of a token", () => {
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    for (let run = 0; run < 400; run += 1) {
      const encoded = encodeFragmentToken(newFragmentToken(run % 2 === 0));
      const at = Math.floor(Math.random() * encoded.length);
      const to = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      const mutated = `${encoded.slice(0, at)}${to}${encoded.slice(at + 1)}`;
      const result = decodeFragmentToken(mutated);

      if (result.status === "ok") {
        expect(encodeFragmentToken(result.token)).toBe(mutated);
      } else {
        expect(result).toStrictEqual({ status: "incomplete" });
      }
    }
  });

  it("never throws, whatever arrives in the fragment", () => {
    const junk = [
      "#",
      "null",
      "undefined",
      "%20",
      "a".repeat(1000),
      " ",
      "🔥🔥🔥",
      "AAAA".repeat(12),
    ];

    for (const value of junk) {
      expect(() => decodeFragmentToken(value)).not.toThrow();
    }
  });
});

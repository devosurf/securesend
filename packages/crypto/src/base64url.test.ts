import { describe, expect, it } from "vitest";
import { base64urlToBytes, bytesToBase64url } from "./base64url";

const UNEXPECTED_CHARACTER = /^not base64url: unexpected character$/;
const INCOMPLETE = /^not base64url: incomplete$/;
const TRAILING_BITS = /^not base64url: trailing bits$/;

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function ascii(text: string): Uint8Array {
  return bytes(...[...text].map((char) => char.charCodeAt(0)));
}

describe("bytesToBase64url", () => {
  // RFC 4648 section 10 vectors, url alphabet, padding stripped.
  it.each([
    ["", ""],
    ["f", "Zg"],
    ["fo", "Zm8"],
    ["foo", "Zm9v"],
    ["foob", "Zm9vYg"],
    ["fooba", "Zm9vYmE"],
    ["foobar", "Zm9vYmFy"],
  ])("encodes %o as %o", (input, expected) => {
    expect(bytesToBase64url(ascii(input))).toBe(expected);
  });

  it("uses the url-safe alphabet instead of + and /", () => {
    expect(bytesToBase64url(bytes(0xfb, 0xff))).toBe("-_8");
  });

  it("never pads", () => {
    for (let length = 0; length < 32; length += 1) {
      const encoded = bytesToBase64url(new Uint8Array(length));
      expect(encoded).not.toContain("=");
    }
  });
});

describe("base64urlToBytes", () => {
  it("round-trips every length up to three blocks", () => {
    for (let length = 0; length <= 12; length += 1) {
      const input = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) {
        input[index] = (index * 37 + 11) % 256;
      }
      expect(base64urlToBytes(bytesToBase64url(input))).toStrictEqual(input);
    }
  });

  it("round-trips a 32 byte key", () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    expect(base64urlToBytes(bytesToBase64url(key))).toStrictEqual(key);
  });

  it("rejects characters outside the alphabet", () => {
    expect(() => base64urlToBytes("Zm9v=")).toThrow();
    expect(() => base64urlToBytes("Zm+v")).toThrow();
    expect(() => base64urlToBytes("Zm/v")).toThrow();
    expect(() => base64urlToBytes("Zm9 v")).toThrow();
  });

  it("rejects a length no byte string can produce", () => {
    expect(() => base64urlToBytes("Zm9vY")).toThrow();
  });

  // "Zg" is the one encoding of [102]. "Zh" carries bits in the tail that the
  // encoder always leaves at zero, so a corrupt last character has to fail here
  // rather than decode to a plausible key.
  it("rejects bits in the tail that the encoder never sets", () => {
    expect(bytesToBase64url(bytes(102))).toBe("Zg");

    for (const corrupted of ["Zh", "Zp", "Z_"]) {
      expect(() => base64urlToBytes(corrupted)).toThrow(TRAILING_BITS);
    }
  });

  // The fragment token is base64url, so a decode failure must never quote its input.
  it("keeps the rejected input out of the error message", () => {
    expect(() => base64urlToBytes("Zm9vYmFyc2VjcmV0!!")).toThrow(
      UNEXPECTED_CHARACTER
    );
    expect(() => base64urlToBytes("Zm9vYmFyc2VjcmV0Z")).toThrow(INCOMPLETE);
  });
});

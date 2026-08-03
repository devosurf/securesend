import { describe, expect, it } from "vitest";
import { base64urlToBytes, bytesToBase64url } from "./base64url";
import {
  isSecretId,
  newSecretId,
  SECRET_ID_BYTES,
  SECRET_ID_LENGTH,
} from "./ids";

describe("newSecretId", () => {
  it("carries 128 bits", () => {
    expect(SECRET_ID_BYTES).toBe(16);
    expect(base64urlToBytes(newSecretId())).toHaveLength(SECRET_ID_BYTES);
  });

  it("is 22 base64url characters", () => {
    expect(SECRET_ID_LENGTH).toBe(22);
    expect(newSecretId()).toHaveLength(SECRET_ID_LENGTH);
  });

  // 22 characters hold 132 bits, so the last one spends 2 bits on the key and
  // leaves 4 at zero. Only four characters can end an id, and a link whose
  // last character is anything else was corrupted in transit.
  it("ends on one of the four characters that spend no bits", () => {
    for (let run = 0; run < 200; run += 1) {
      expect("AQgw").toContain(newSecretId().slice(-1));
    }
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newSecretId()));

    expect(ids.size).toBe(2000);
  });
});

describe("isSecretId", () => {
  it("accepts every id the generator makes", () => {
    for (let run = 0; run < 200; run += 1) {
      expect(isSecretId(newSecretId())).toBe(true);
    }
  });

  it("rejects lengths the generator cannot produce", () => {
    const id = newSecretId();

    expect(isSecretId(id.slice(0, -1))).toBe(false);
    expect(isSecretId(`${id}A`)).toBe(false);
    expect(isSecretId("")).toBe(false);
  });

  it("rejects characters outside the alphabet", () => {
    const id = newSecretId();

    expect(isSecretId(`${id.slice(0, -1)}+`)).toBe(false);
    expect(isSecretId(`${id.slice(0, -2)}=A`)).toBe(false);
    expect(isSecretId(`${id.slice(0, -2)} A`)).toBe(false);
  });

  it("rejects a last character carrying bits the generator leaves at zero", () => {
    const id = bytesToBase64url(new Uint8Array(SECRET_ID_BYTES));

    expect(isSecretId(id)).toBe(true);
    expect(isSecretId(`${id.slice(0, -1)}B`)).toBe(false);
  });
});

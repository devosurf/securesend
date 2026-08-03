import { describe, expect, it } from "vitest";
import { composeDataKey, PBKDF2_ITERATIONS } from "./compose";
import {
  FRAGMENT_KEY_BYTES,
  FRAGMENT_SALT_BYTES,
  type FragmentToken,
  newFragmentToken,
} from "./fragment";

const PROBE = new TextEncoder().encode("probe");
const PASSWORD = "northwind";

const TAKES_NO_PASSWORD = /takes no password/;
const NEEDS_A_PASSWORD = /needs a password/;

/** Whether two derivations landed on the same key, without extracting either. */
async function interchangeable(
  sealWith: CryptoKey,
  openWith: CryptoKey
): Promise<boolean> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { iv, name: "AES-GCM" },
    sealWith,
    PROBE
  );

  try {
    await crypto.subtle.decrypt({ iv, name: "AES-GCM" }, openWith, sealed);
    return true;
  } catch {
    return false;
  }
}

function rawAesKey(bytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function tokenWith(
  key: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>
): FragmentToken {
  return { key, needsPassword: true, salt };
}

function filled(length: number, value: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(length).fill(value);
}

describe("composeDataKey", () => {
  // This number is a public claim, stated outright on the security page. It
  // cannot drift quietly.
  it("runs PBKDF2 600,000 times", () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  // Two spellings of the same characters have to be the same password. macOS
  // hands over the decomposed one and Windows the composed one.
  it("derives the same key from either unicode spelling of a password", async () => {
    const token = newFragmentToken(true);
    const composed = "lösenordet";
    const decomposed = composed.normalize("NFD");

    expect(decomposed).not.toBe(composed);
    expect(
      await interchangeable(
        await composeDataKey(token, composed),
        await composeDataKey(token, decomposed)
      )
    ).toBe(true);
  });

  it("keeps the derived key out of javascript", async () => {
    const key = await composeDataKey(newFragmentToken(true), PASSWORD);

    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ length: 256, name: "AES-GCM" });
  });

  it("uses the fragment key itself when no password protects the envelope", async () => {
    const token = newFragmentToken(false);

    expect(
      await interchangeable(
        await composeDataKey(token),
        await rawAesKey(token.key)
      )
    ).toBe(true);
  });

  // "The password composes with the link key, it never replaces it": the whole
  // link stays useless on its own, which is the point of the feature.
  it("does not land on the fragment key when a password protects the envelope", async () => {
    const token = newFragmentToken(true);

    expect(
      await interchangeable(
        await composeDataKey(token, PASSWORD),
        await rawAesKey(token.key)
      )
    ).toBe(false);
  });

  it("derives the same key twice from the same token and password", async () => {
    const token = newFragmentToken(true);

    expect(
      await interchangeable(
        await composeDataKey(token, PASSWORD),
        await composeDataKey(token, PASSWORD)
      )
    ).toBe(true);
  });

  it("derives a different key from a different password", async () => {
    const token = newFragmentToken(true);

    expect(
      await interchangeable(
        await composeDataKey(token, PASSWORD),
        await composeDataKey(token, "northwinD")
      )
    ).toBe(false);
  });

  it("derives a different key from a different salt", async () => {
    const key = filled(FRAGMENT_KEY_BYTES, 7);

    expect(
      await interchangeable(
        await composeDataKey(
          tokenWith(key, filled(FRAGMENT_SALT_BYTES, 1)),
          PASSWORD
        ),
        await composeDataKey(
          tokenWith(key, filled(FRAGMENT_SALT_BYTES, 2)),
          PASSWORD
        )
      )
    ).toBe(false);
  });

  it("derives a different key from a different fragment key", async () => {
    const salt = filled(FRAGMENT_SALT_BYTES, 3);

    expect(
      await interchangeable(
        await composeDataKey(
          tokenWith(filled(FRAGMENT_KEY_BYTES, 1), salt),
          PASSWORD
        ),
        await composeDataKey(
          tokenWith(filled(FRAGMENT_KEY_BYTES, 2), salt),
          PASSWORD
        )
      )
    ).toBe(false);
  });

  it("refuses a password the envelope has no salt for", async () => {
    await expect(
      composeDataKey(newFragmentToken(false), PASSWORD)
    ).rejects.toThrow(TAKES_NO_PASSWORD);
  });

  it("refuses to derive without the password the envelope needs", async () => {
    await expect(composeDataKey(newFragmentToken(true))).rejects.toThrow(
      NEEDS_A_PASSWORD
    );
  });
});

import type { FragmentToken } from "./fragment";
import { utf8 } from "./utf8";

/**
 * What the browsers ship. Argon2id would be the better algorithm, and using it
 * would mean serving a third-party WASM blob on the one page whose pitch is
 * that it has no third-party code. The fragment token carries a version byte so
 * this can change.
 */
export const PBKDF2_ITERATIONS = 600_000;

/** Versioned, so this key can never collide with a later use of the same inputs. */
const DATA_KEY_LABEL = "securesend:v1:data-key";

const DERIVED_BITS = 256;

function aesKey(bytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * The same characters have to derive the same key on every machine. A password
 * with an accent in it has two legal spellings in Unicode: macOS hands over the
 * decomposed one, Windows and iOS the composed one. Without normalising, a
 * recipient could type the right password on the wrong platform, get a GCM
 * failure, and never find out why, on a link that only opens once. NFC is what
 * RFC 8265 specifies for passwords.
 */
async function passwordBits(
  password: string,
  salt: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const base = await crypto.subtle.importKey(
    "raw",
    utf8(password.normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        hash: "SHA-256",
        iterations: PBKDF2_ITERATIONS,
        name: "PBKDF2",
        salt,
      },
      base,
      DERIVED_BITS
    )
  );
}

/**
 * The data key every ciphertext in an envelope is encrypted under.
 *
 * With no password it is the fragment key: 32 bytes of Web Crypto randomness
 * used for exactly one purpose, which is already an AES-256 key.
 *
 * With a password the two compose. The password stretches through PBKDF2 over
 * the salt the fragment carries, and the result is HKDF-combined with the
 * fragment key under a versioned label. So the link alone is useless, the
 * password alone is useless, and a stolen database is useless without both.
 * There is no verifier of any kind: a wrong password is a local GCM failure and
 * the server never learns that an attempt happened.
 *
 * One salt does both jobs. HKDF's salt is not secret, the two functions take
 * different inputs, and it keeps the token at 50 bytes.
 */
export async function composeDataKey(
  token: FragmentToken,
  password?: string
): Promise<CryptoKey> {
  if (!token.needsPassword) {
    if (password !== undefined) {
      throw new Error("this envelope takes no password");
    }

    return await aesKey(token.key);
  }

  if (password === undefined) {
    throw new Error("this envelope needs a password");
  }

  const stretched = await passwordBits(password, token.salt);
  const material = new Uint8Array(token.key.length + stretched.length);
  material.set(token.key);
  material.set(stretched, token.key.length);

  const combined = await crypto.subtle.importKey(
    "raw",
    material,
    "HKDF",
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      hash: "SHA-256",
      info: utf8(DATA_KEY_LABEL),
      name: "HKDF",
      salt: token.salt,
    },
    combined,
    { length: DERIVED_BITS, name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

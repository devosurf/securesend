import type { webcrypto } from "node:crypto";

/**
 * Node declares `globalThis.crypto` and stops there, so `CryptoKey` is a name
 * that exists at runtime and not at compile time. The crypto package's signatures
 * use it, and this is the first package to consume them without the DOM lib.
 * Naming the type here rather than adding DOM keeps `window` and `document` out
 * of a process that has neither and would only fail on reaching for them.
 */
declare global {
  type CryptoKey = webcrypto.CryptoKey;
}

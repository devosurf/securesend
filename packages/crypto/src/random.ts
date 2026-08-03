/**
 * Randomness for keys, salts, ids and IVs. Every caller here asks for 32 bytes
 * or fewer, well under the 65536-byte limit getRandomValues rejects, so there
 * is nothing to chunk.
 */
export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** UTF-8 bytes. The only text encoding anything in this package uses. */
export function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

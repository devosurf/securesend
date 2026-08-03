const KIB = 1024;

/**
 * How big a thing is, in the one phrasing the interface uses for it: a cap in a
 * sentence, and the size beside a filename on both sides of the wire.
 *
 * It lives here rather than beside either of them because the sender's row and
 * the recipient's row have to agree, and a second spelling is how a 14 KB file
 * becomes 13.7 KB one screen later.
 *
 * Nothing rounds down to zero except nothing: a file of a few hundred bytes is a
 * real file, and a row reading "0 KB" would look like one that failed to attach.
 */
export function spokenSize(bytes: number): string {
  const kib = bytes / KIB;

  if (kib >= KIB) {
    return `${(kib / KIB).toFixed(1)} MB`;
  }

  return `${bytes === 0 ? 0 : Math.max(1, Math.round(kib))} KB`;
}

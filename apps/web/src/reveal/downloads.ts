import type { OpenedFile } from "@securesend/crypto/envelope";

/*
 * A file, out of this tab and onto the recipient's own disk.
 *
 * There is nothing to fetch. The bytes were decrypted here a moment ago and the
 * instance no longer has them, so the download is a blob this page makes out of
 * what it is already holding. No zip is ever built either: nothing here needed to
 * be one object, it only needed to be one action.
 *
 * A download has to be started while the press is still the browser's idea of a
 * user gesture, which is why every caller does this before it awaits anything.
 */

/** What a browser calls a file it was given no type for. */
const UNTYPED = "application/octet-stream";

export function saveFile(file: OpenedFile): void {
  const url = URL.createObjectURL(
    new Blob([file.bytes], { type: file.type === "" ? UNTYPED : file.type })
  );

  const link = document.createElement("a");
  link.download = file.name;
  link.href = url;

  // In the document, because not every browser follows a click on an anchor that
  // is not in one. It is gone again before the next frame.
  document.body.append(link);
  link.click();
  link.remove();

  // On the next task rather than now: the browser reads the url after the click
  // returns, and revoking it inside the same one cancels the download.
  setTimeout(() => URL.revokeObjectURL(url));
}

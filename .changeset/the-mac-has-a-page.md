---
"@securesend/web": minor
---

The integrations page reads `available` on the macOS row now, with a page of its own behind it at `/integrations/macos`. SecureSend for macOS is a menu bar app: select the secret wherever it already is, right-click, and the selection is replaced by a one-time link. Where the app you are in does not take the selection back, which is the standard Services hand-back and not every app honours it, "Copy as SecureSend link" puts the link on the clipboard instead and one paste finishes the job. A file in Finder goes the same way, up to the 10 MB envelope the instance accepts, and "Generate from clipboard" in the menu bar and a remappable hotkey do it without a selection at all.

The page is written around the thing that makes this integration the strongest of the three: the sealing happens on the Mac itself, in CryptoKit, with AES-256-GCM and the same envelope a tab writes, so nothing about the secret passes through anybody else on its way to a link. The link lasts 24 hours or one view, whichever comes first, because a right-click has no screen to choose an expiry on, and the page says plainly that anyone holding the whole link can open it.

All three integrations are built now, so the paragraph under the list says that rather than counting what is left, and the line above the list names the device rather than the browser tab: a secret is locked where it already was, in a tab, a terminal or a menu bar.

---
"@securesend/web": minor
"@securesend/api": minor
---

An envelope can carry files. Attach them with the button in the composer, or drag them anywhere onto the page: the panel lights up and tints the region they will land in, and the affordance strip becomes the drop prompt in place, so nothing moves under the cursor mid-drag. Each file arrives as a row with its name and its size and a way to take it off again. On a phone there is nothing to drag, so the attach affordance sits in the bar in thumb reach and opens the device's own picker, which is where the photos are.

Every file is encrypted in your browser, separately, under the same key as the rest of the envelope. The name, the size and the type go inside the envelope's own ciphertext, so what we store is a numbered list of blobs: we do not know what your files are called, how many bytes each one really was, or what kind of thing it is. A whole secret may weigh 10 MB across everything in it, and your browser refuses more than that before anything is encrypted rather than after.

The recipient gets a download row per file, beside the copy rows for the note and the login. One press takes everything: the text to the clipboard and the files to the downloads folder, in the same gesture, and afterwards the bar says where each half went. No zip is ever built, because nothing here needed to be one object. It only needed to be one action.

Files die with the secret they came in. A reveal hands them over and deletes them in the same transaction, a burn destroys them with the envelope, and what is left behind is a tombstone that does not say how many files there were or how big.

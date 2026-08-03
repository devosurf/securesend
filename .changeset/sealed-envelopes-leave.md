---
"@securesend/web": minor
"@securesend/api": minor
---

You can send a secret. The homepage is the create form: paste a note, optionally add one username and password pair, optionally set a password the recipient will need, pick an expiry of 1, 24 or 72 hours, and press Create link. Your browser makes a key and encrypts the whole envelope with it before anything leaves the tab. What we receive is bytes we cannot read; the key is the part of the link after the hash, which browsers never send to a server.

Then the receipt: the whole link, never truncated, breaking at its hash so the key is always visible, with one press to copy it. Under it, in one line each, what the link will do: it needs the password if you set one, it opens once, it expires in the time you chose. When you did set a password, the receipt says out loud that a link and its password in one message is one message that opens the secret. This browser quietly keeps the link's id and a token that will let it burn the secret early, so it can watch what you sent without an account. It keeps no key, so your own history can never re-leak a secret.

On a phone the affordances and Create link are pinned above the keyboard where a thumb rests, the introduction hands its height to the envelope the moment you start typing, and the receipt offers a share sheet.

An envelope over 256 KB of text is refused in your browser before anything is encrypted, and by the instance if it ever gets there. Nothing about a refusal, an unreachable instance, or a taken link id costs you the secret: it is still in the tab, and pressing the button again is the whole recovery.

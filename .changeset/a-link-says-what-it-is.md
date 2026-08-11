---
"@securesend/web": minor
"@securesend/api": minor
---

A link to this product now arrives with a face on it.

Pasting a secret's link into a chat used to produce a bare address with the key cut out of the middle of it, which reads like something a careful person should not click. It now unfurls as a card: the mark, "Someone sent you a secret.", and the sentence the page behind it opens with. The words are the reveal screen's own, quoted rather than written again for the occasion, and the picture is drawn from the same tokens and the same font files the product serves.

That card is one static picture for every secret there is. It says what the link is and never whether it is still live, so nothing about a particular secret is in it and nothing about it changes once the secret has been opened. The preview is fetched without the key, because no client sends a fragment to a server, and loading the page has never consumed anything: only the reveal press does. A chat window drawing a card cannot open what it points at, spend it, or say anything about it.

A secret's address keeps everything it had. It is still noindex in the document and in the header, still disallowed in `robots.txt`, and it is given no canonical address, because one file is served for every secret and any address written there would be a lie about all but one of them.

The homepage and the security page get the same treatment plus the parts a search result reads: a card, a canonical address, and the description each page already had.

Every instance names itself. The absolute addresses in a card are filled in from the request as the document goes out rather than baked in at build time, so an instance you run points at your own domain, for the picture and for the page, and never at ours.

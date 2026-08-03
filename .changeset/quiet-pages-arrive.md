---
"@securesend/web": minor
"@securesend/api": minor
---

The site has pages now. The homepage explains the mechanism under the fold, in three steps, then lists what sits on the server and what never does, then names the claims we are not making. `/security` is the whole security story in eight parts: what the server sees, what one-time means precisely, how a password composes with the link key, the page you are trusting, abuse, and what we cannot protect you from. Both hold their shape on a phone.

Both pages are rendered at build time, so the words are in the document before any JavaScript runs, and both are served with the headers the security page tells you to check: a content security policy that allows this origin and nothing else, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, and `noindex` on secret routes. The three typefaces are served from this origin too. The page makes no request to anybody else, which you can confirm in a network panel.

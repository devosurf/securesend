---
"@securesend/web": minor
"@securesend/api": minor
---

You can run this yourself, and you can check what it claims.

The repository now carries the whole story a stranger needs. A README that leads with the caveat rather than burying it, because "anyone holding the whole link can decrypt it" is the first thing an evaluator should read. A self-hosting guide with the thing that would otherwise waste your afternoon at the top: the encryption happens through the browser's Web Crypto, which browsers only expose over HTTPS or on localhost, so an instance served over plain HTTP on a real hostname cannot encrypt at all. A threat model that goes adversary by adversary and names what each one gets, including the two that are uncomfortable: an operator can serve you different code, and minimal logging means we could not help you investigate an abuse report. And a page about the licence, which is AGPLv3, and which mostly means: run it unmodified and you owe nobody anything.

Alongside those, the ordinary furniture of a repository somebody else can arrive in. How to report something and what we will do about it, with no bounty programme and no pretending there is one. How to contribute, starting with the scope sentence, because a pull request that adds a settings panel is going to be turned down however good the code is. A changelog. The licence itself.

The claims are now checked on every commit rather than remembered. The pages and the stylesheet they ship fetch nothing from another origin and run nothing inline; no surface makes a claim we are not allowed to make, the words we are only allowed to deny have to sit in a sentence that denies them, and neither "end-to-end" nor "zero-knowledge" may appear out of sight of the caveat that anyone holding the whole link can decrypt; the URL fragment is touched in two named places and a third would fail, which is that rule in one greppable line; the header bundle rides every class of response, including the real built pages served the way the container serves them; `.env.example` documents every variable the process reads, and the process reads them in one place; and every repository destination the footer points at is a file that exists, so a trust link cannot quietly rot into a 404.

Each of those checks has been pointed at a violation on purpose and watched to fail, because an audit that has only ever been green proves that it ran rather than that it works.

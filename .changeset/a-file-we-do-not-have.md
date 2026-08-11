---
"@securesend/web": minor
"@securesend/api": minor
---

Ask this instance for a file it does not have and it says so.

Every unmatched address used to be answered with the client-rendered shell, which
is right for a route and wrong for a file. A 200 is a promise, and everything
downstream believes it: a CDN filed a page of markup under `og.png` and served it
for four hours, Google asked for `/favicon.ico`, got a document, and put a generic
globe beside the site in its results, and `/sitemap.xml` claimed to exist. Three
symptoms, one answer. A path whose last segment carries an extension is now a 404,
which is safe to key on because no route here has a dot in it: there are three,
and the only variable part of any of them is a secret id, which is base64url.

The icons that answer arrives with are drawn from the same mark the wordmark uses.
`favicon.ico` carries 16, 32 and 48 pixel renderings for the request every browser
makes off the root before it has parsed a line of the page, and there is a 96 pixel
raster named in the head for Google, whose guidance asks for a square larger than
48. The svg stays, and stays first for anything modern enough to prefer it.

There is a sitemap now, listing the two pages meant to be found and nothing else,
with a `Sitemap` line in `robots.txt` pointing at it. Both name whatever this
instance is called rather than the domain we happen to run, the same way a share
card's image already did. Neither carries a `lastmod`: the honest value is when the
words on a page last changed, a build that reruns on every deploy does not know
that, and a wrong one teaches a crawler to ignore the file.

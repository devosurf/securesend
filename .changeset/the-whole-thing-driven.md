---
"@securesend/web": minor
"@securesend/api": minor
---

The whole product is now driven all the way through before anything ships, in the container people actually run.

Three handovers, in a real browser, against the built image rather than a dev server. A secret with a note, a login and a file goes from one browser to another: the sender copies the link, a recipient who has never sent anything opens it once, takes one field on its own and then everything in a single press, and the file that lands on the disk is the file that left, byte for byte. Then the same with a password, including one wrong try, which spends the link and leaves the encrypted secret in the recipient's tab to try again. Then a burn, where the sender destroys a sealed secret and the stranger who opens the link afterwards is told the sender did it rather than that somebody read it. The key travels through a real address bar and is gone from it before anything else happens, which is the one thing no test outside a browser can watch.

The moves are held to the durations the design fixes them at. The envelope goes quiet while the browser encrypts, the secret uncovers over 520 milliseconds, and a wrong password plays the burn instead, with its arrival held behind the dissolve so finality reads as stillness. A reader who has asked their system for less motion gets all of it collapsed, and the pause the burn was built around goes with it.

Pages arrive faster, and a crawler asking about them gets a straight answer. Everything text-shaped now leaves the instance compressed, and it is the process's own job rather than something a self-hoster has to put a proxy in front of to get: measured over a simulated phone connection, it takes the homepage from arriving in four and a half seconds to arriving in two and a half. There is a `robots.txt`, which asks crawlers to leave secret addresses alone and, before this, was a request that quietly returned a web page. The two static pages carry a description, written from their own words.

All of it is a gate on every commit, at 95 or better on the homepage and on a sealed secret. Two things about that number are worth saying plainly. It is Lighthouse's desktop configuration: over its simulated phone connection the homepage reaches 92, held there by the size of the bundle and the three self-hosted typefaces rather than by anything the gate could fix. And one automated accessibility check is set aside, because it fails on the design system's quietest ink, and lightening that is a decision about how the whole product looks rather than a fix. Both are written down where they are done, and the gate insists that check is the only one set aside, so the exception cannot widen without somebody saying so out loud.

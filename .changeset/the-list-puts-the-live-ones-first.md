---
"@securesend/web": minor
---

The list of what this browser has sent now puts the links that are still sealed at the top, in their own panel, with everything that has finished below in the order it was in. Newest first is the only order this list can honestly default to, and on a browser that has been sending for a week it buries the one or two rows you can still do something about under a dozen you cannot. The rule the new order follows is simple enough to state after looking at it once: rows something can still happen to, then rows nothing can.

Under the list there is a new quiet action, `Clear the 13 that are done`. It takes the used, burned and expired rows out of this browser's memory and nothing else. It asks nothing first, because what it takes are tombstones: those secrets were gone long before their rows were, and what you lose is the ability to match an id against a message you sent, for the few days before the row would have been forgotten anyway.

There is deliberately no version of that control which clears everything. A sealed row carries the token that is this browser's only way to burn that secret early, so forgetting one would leave the secret alive for the rest of its expiry with nobody able to end it. That is as final as burning it and it looks like tidying up, so a sealed link leaves this list by being burned or by running out, and by nothing else.

Burning a link from the list moves its row, since the order is what changed. The row now holds its place while the tombstone settles, so the burn plays where you were looking instead of the line jumping down the page mid-animation.

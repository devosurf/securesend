---
"@securesend/web": minor
"@securesend/api": minor
---

Secrets now die on their own, and the instance can say no.

A secret whose clock has run out was already refused at every route, on the timestamp alone, whether or not anything had swept. Now its contents are destroyed too. Within a minute of an expiry the ciphertext and every attached file are gone, and what is left is a tombstone: a status and its timestamps, nothing about what was inside and nothing about how many files there were. The expired link still tells whoever follows it the truth, in amber rather than red, because a clock running out is not a failure and nobody read what was in there.

Seven days after that the row goes too. From then on the link answers the same way as one that was never real, which is a privacy property rather than an oversight: we cannot tell you what used to be at an address we no longer have. The week in between is what keeps the sender's own "expired, never used" row and the recipient's dead ends answerable while anybody is still asking about that handover. All of this runs inside the one process, so self-hosting still needs no cron job, and a missed pass costs disk rather than correctness.

Creating, opening and asking about a secret now have a pace. There is no CAPTCHA and no third-party bot check, because zero third-party requests is a claim this site invites you to check in a network panel, so abuse is bounded structurally instead: one-time links, a 72 hour ceiling, size caps, a limit per caller and one more across the whole instance for creates. Every number is yours to change in one place, and the defaults are far past what sending a link looks like.

Meeting one of those limits is an ordinary thing rather than an error, so it reads like one. Nothing is stored, nothing is shared, nothing is spent, and the secret is still in the tab you are looking at. The page says which limit it was, because "you are going faster than we take" and "we are full right now" are different facts and one of them is not about you, and it says how long to wait using the instance's own number rather than a vague moment. When something in between refuses instead, and names no reason, the page names none either.

A recipient who is metered stays exactly where they were, on a link nobody has spent, with the same button. A sender who re-checks their history too often is told that is what happened, and keeps every row: the list is as old as the line above it already says it is.

The counters stay four numbers a day: creates, opens, burns, expiries. No address, no secret id, nothing joining a request to a person. The rate limits are the one place an address is touched at all, and they hold it in memory for minutes, never on disk, dropped the moment the caller has their allowance back and never for longer than a day.

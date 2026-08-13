---
"@securesend/web": minor
"@securesend/api": minor
---

SecureSend answers `/ss` in Slack now. You type it in a channel, and a private reply nobody else can see offers one button. The button opens a SecureSend tab with the caret already in the field, because you pressed Enter thirty seconds ago to get here and that muscle is still warm. Type the secret, press Enter again, and the link is in the channel before you have finished reading the receipt.

The bot never sees your secret, and the reason is structural rather than a promise. There is no field in Slack that takes one: `/ss` is a door, not a form, and anything you type after it is dropped on arrival and never stored, logged or repeated back. The locking still happens in your browser, and the finished link is posted to the channel by that same browser through a one-time reply handle Slack attaches to your own command. It goes to Slack without going through us. The honest caveat has not moved: anyone holding the whole link can open the secret, and the link is now sitting in a channel, so send it to the channel you meant.

Two messages arrive, not one, and the split is deliberate. The channel gets the link, written out whole so it survives being copied as well as clicked, and it carries no buttons and is never edited afterwards. You privately get the buttons: stretch the expiry to 48 or 72 hours, or burn it now. Slack hands an app the entire message a button was pressed on, so a button sitting next to the link would have handed us the key on the first press. Keeping them apart is what stops that. It has a visible cost and it is not a bug: burn the secret and the post above still says what it said, because correcting it would mean sending the key again. The private message is what tells you the truth afterwards, and it says so.

The app asks for one permission, `commands`, so it can answer `/ss`. Nothing for posting, nothing for reading your channels, your history or your files. There is an `/integrations/slack` page laying all of this out, and the Slack row on the integrations index now reads `available`.

Self-hosters get the same thing for nothing. The repository ships an app manifest you point at your own instance, and `SLACK_SIGNING_SECRET` is the only value your instance needs. No client id, no secret, no account with us.

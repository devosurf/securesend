# SecureSend in Slack

Type `/ss` in a channel and SecureSend replies privately with one button. The
button opens a SecureSend window in your browser, you type the secret there, and
the finished link is posted back to the channel by your own browser.

The secret is encrypted in that browser before anything leaves it, and the key
travels in the part of the link after the `#`, which never reaches a server. So
the app never sees the secret. Anyone holding the whole link can decrypt it, and
that is the whole security model: treat the link as the secret.

## Self-hosters make their own Slack app

You do not install ours and you do not need our credentials. A Slack app is free,
takes about five minutes, and points at your instance instead of at securesend.dev.
Nothing about this integration is paywalled or held back from a self-hosted
instance.

1. Open <https://api.slack.com/apps> and choose **Create New App**, then **From
   an app manifest**. Pick your workspace.
2. Paste [`slack-app-manifest.json`](./slack-app-manifest.json) from this
   directory, switching the tab to JSON first.
3. Replace all three `https://YOUR-INSTANCE.example.com` placeholders with your
   own origin before you submit. They are the slash command url, the redirect
   url and the interactivity request url.
4. Create the app, then **Install to Workspace** from its own dashboard.
5. Copy **Signing Secret** from Basic Information, App Credentials, and set it on
   your instance as `SLACK_SIGNING_SECRET`. Restart.

That is the whole setup. One environment variable.

Your instance has to be reachable over HTTPS from the internet, because Slack
posts to it. Slack will not accept an `http://` url or a private address.

### The three urls, and what each is for

| Where in the manifest | What it is |
| --- | --- |
| `features.slash_commands[0].url` | Where Slack posts `/ss`. |
| `settings.interactivity.request_url` | Where Slack posts a button press on the private controls message. |
| `oauth_config.redirect_urls[0]` | Only used by the Add to Slack handshake, which you are not using. Slack wants a valid url anyway. |

### Why there is a bot user in a manifest with no bot

Slack refuses a manifest that declares a slash command and no `bot_user`, even
when the only scope requested is `commands`. So the manifest declares one. It
grants no permission, it reads nothing, and it never posts: every message in this
flow is either a private reply to a command or a post your own browser makes with
a one-time reply handle Slack issued.

### Why the command has no usage hint

A usage hint is the grey text Slack shows after a command in the composer, and
it is where an app tells you what to type. This one has none, deliberately.
There is nothing to type after `/ss`, and a hint sitting there would invite the
one thing this integration exists to prevent: a secret typed into a Slack
composer. The command's own description says to send it on its own, and the
private reply says the same thing again if anything follows it.

### You do not need the client id and secret

`SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` exist for one thing: the public **Add
to Slack** button on securesend.dev, which runs the OAuth handshake at
`/slack/install`. Leave them unset and that route says this instance has no Slack
app configured, which is the truth for an instance whose operator installed their
own app from their own dashboard.

Nothing at runtime holds a Slack token, on our instance or yours. Slack posts a
signed request, the route answers that request, and the browser posts the finished
link to a one-time reply handle that arrived in the same payload. The install
handshake does mint a bot token, because Slack requires the exchange to complete
an install, and `apps/api/src/slack/install.ts` throws it away without storing it.

## `commands` and nothing else

The manifest requests one scope: `commands`. That is what lets a workspace run
`/ss`. It grants no ability to read messages, list channels, see members, or post
anywhere the app was not explicitly invited by a person's own press.

The `/integrations/slack` page states this to the people deciding whether to
install. **A scope added to this manifest makes that page a lie.** If a change
ever needs another scope, the page's permissions copy and this file change in the
same commit, or the change does not land.

## What the app can and cannot see

It can see what Slack sends with a slash command: the workspace id, the channel
id and name, and the id and display name of whoever typed it. It reads the channel
so the reply knows where it is, and it stores none of it.

It cannot see the secret. Anything typed after `/ss` is dropped the moment the
request arrives: never logged, never stored, never echoed back, including in an
error. That is asserted by a test, not by a promise. Slack does not post a slash
command to the channel either, so a mistyped secret is not visible to the room.

## How the hosted app is configured

securesend.dev runs the same container as everybody else, with the same manifest
and the same one scope. Its three urls are:

- Slash command: `https://securesend.dev/api/slack/command`
- Interactivity: `https://securesend.dev/api/slack/interactions`
- Redirect: `https://securesend.dev/slack/install/callback`

It sets all three Slack variables, because it is the instance the public Add to
Slack button installs from. Everything else about it is what this repository
ships.

## When it does not work

**Slack says "dispatch_failed" or the reply never comes.** Your instance was not
reachable or did not answer within three seconds. Check the url in the manifest
matches your origin exactly, including `/api`.

**Every `/ss` is refused.** `SLACK_SIGNING_SECRET` is unset, wrong, or the process
was not restarted after it was set. The Slack routes refuse everything while it is
unset, because an instance without it has no Slack app and there is nobody a Slack
route could be answering.

**The buttons on the private message do nothing.** Interactivity is off, or its
request url is wrong. It is a separate switch from the slash command in Slack's
dashboard.

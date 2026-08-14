# Changelog

What changed, written as prose about what you experience rather than as a list of
commits. One entry per release, newest first.

The packages in this workspace share one version number, so a release is one
thing rather than several. Changes that have landed since the last release live
in [`.changeset/`](./.changeset) until the next one folds them in.

## 1.1.0 (2026-08-14)

### The Mac gets its own page

The integrations list says the macOS app is available, and `/integrations/macos`
is the page behind it. SecureSend for macOS is a menu bar app: select a secret
wherever it already is, right-click, and the selection is replaced by a one-time
link. Where the app you are in will not take a replacement back, and not every
app does, "Copy as SecureSend link" puts the link on the clipboard instead and
one paste finishes the job. "Generate from clipboard" in the menu bar does the
same for something you copied a moment ago.

The page is written around the thing that makes this the strongest of the three
integrations: the sealing happens on the Mac itself, in CryptoKit, with the same
AES-256-GCM envelope a browser tab writes. Nothing about the secret passes
through anybody else on its way to becoming a link. Those links last 24 hours or
one view, whichever comes first, because a right-click menu has no screen on
which to choose an expiry, and the page says plainly that anyone holding the
whole link can open it.

The download comes from the app's own repository, which is public, and every
release carries the signed and notarized disk image along with its checksum.

## 1.0.0 (2026-08-13)

The first release: everything the product is, in the order it arrived.

### Quiet pages arrive

The site has pages now. The homepage explains the mechanism under the fold, in three steps, then lists what sits on the server and what never does, then names the claims we are not making. `/security` is the whole security story in eight parts: what the server sees, what one-time means precisely, how a password composes with the link key, the page you are trusting, abuse, and what we cannot protect you from. Both hold their shape on a phone.

Both pages are rendered at build time, so the words are in the document before any JavaScript runs, and both are served with the headers the security page tells you to check: a content security policy that allows this origin and nothing else, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, and `noindex` on secret routes. The three typefaces are served from this origin too. The page makes no request to anybody else, which you can confirm in a network panel.

### Sealed envelopes leave

You can send a secret. The homepage is the create form: paste a note, optionally add one username and password pair, optionally set a password the recipient will need, pick an expiry of 1, 24 or 72 hours, and press Create link. Your browser makes a key and encrypts the whole envelope with it before anything leaves the tab. What we receive is bytes we cannot read; the key is the part of the link after the hash, which browsers never send to a server.

Then the receipt: the whole link, never truncated, breaking at its hash so the key is always visible, with one press to copy it. Under it, in one line each, what the link will do: it needs the password if you set one, it opens once, it expires in the time you chose. When you did set a password, the receipt says out loud that a link and its password in one message is one message that opens the secret. This browser quietly keeps the link's id and a token that will let it burn the secret early, so it can watch what you sent without an account. It keeps no key, so your own history can never re-leak a secret.

On a phone the affordances and Create link are pinned above the keyboard where a thumb rests, the introduction hands its height to the envelope the moment you start typing, and the receipt offers a share sheet.

An envelope over 256 KB of text is refused in your browser before anything is encrypted, and by the instance if it ever gets there. Nothing about a refusal, an unreachable instance, or a taken link id costs you the secret: it is still in the tab, and pressing the button again is the whole recovery.

### One link opens once

A secret link now opens. Following one shows you a sealed envelope, what pressing it costs, and when it expires if you do not press it. Opening decrypts the secret in your own browser and wipes our copy in the same moment. Loading the page changes nothing, so a link pasted into Slack survives the preview bot that fetches it first. The key comes out of the address bar as the page reads it. It is never in your history and never syncs to another device.

The opened secret arrives in parts, each with its own copy button: the note as prose, the username, the password masked until you ask for it. One press takes the lot to your clipboard and says what it took. On a phone that press is the floor of the page, in thumb reach. The tab is what the secret lives in, and the tab is what gets swiped away.

When the sender set a password, the field is a row inside the sealed panel. The page says out loud, before the press, that the link is spent whether the password is right or not. Get it wrong and the encrypted secret stays in your tab. Try again as often as you like: there is an honest count of the tries you have made and never a limit, because nothing on our side could check a password or count against you.

Every dead end tells the truth and says what to do next. None of them is red. The link has already been used, with the sender to go back to if that was not you. The sender burned it. It expired unread. There is nothing at this link, with a picture of what a whole one looks like and which end goes missing. And the one piece of good news: this link is missing its key. Your browser knows that before it asks us anything, so the secret is still sealed and nothing was destroyed finding out.

On the homepage, what this browser sent is one line under the envelope: how many were used, how many are still sealed. Open it and each one is there as the link without its key, with its state and its clock. Under them, when the statuses were last checked and a way to check again. Nothing polls. The page is not a feed and does not pretend to be one.

A sealed secret can be burned from that list or straight from the receipt. The dialog restates which one you mean and keeps the safe answer under your thumb. A burn destroys the contents immediately, and the next person to open the link is told the sender burned it.

### Files ride along

An envelope can carry files. Attach them with the button in the composer, or drag them anywhere onto the page: the panel lights up and tints the region they will land in, and the affordance strip becomes the drop prompt in place, so nothing moves under the cursor mid-drag. Each file arrives as a row with its name and its size and a way to take it off again. On a phone there is nothing to drag, so the attach affordance sits in the bar in thumb reach and opens the device's own picker, which is where the photos are.

Every file is encrypted in your browser, separately, under the same key as the rest of the envelope. The name, the size and the type go inside the envelope's own ciphertext, so what we store is a numbered list of blobs: we do not know what your files are called or what kind of thing they are. We can still count them and see roughly how big each one is, because encrypting something does not change how much of it there is. A whole secret may weigh 10 MB across everything in it, and your browser refuses more than that before anything is encrypted rather than after.

The recipient gets a download row per file, beside the copy rows for the note and the login. One press takes everything: the text to the clipboard and the files to the downloads folder, in the same gesture, and afterwards the bar says where each half went. No zip is ever built, because nothing here needed to be one object. It only needed to be one action.

Files die with the secret they came in. A reveal hands them over and deletes them in the same transaction, a burn destroys them with the envelope, and what is left behind is a tombstone that does not say how many files there were or how big.

### Nothing outlives its clock

Secrets now die on their own, and the instance can say no.

A secret whose clock has run out was already refused at every route, on the timestamp alone, whether or not anything had swept. Now its contents are destroyed too. Within a minute of an expiry the ciphertext and every attached file are gone, and what is left is a tombstone: a status and its timestamps, nothing about what was inside and nothing about how many files there were. The expired link still tells whoever follows it the truth, in amber rather than red, because a clock running out is not a failure and nobody read what was in there.

Seven days after that the row goes too. From then on the link answers the same way as one that was never real, which is a privacy property rather than an oversight: we cannot tell you what used to be at an address we no longer have. The week in between is what keeps the sender's own "expired, never used" row and the recipient's dead ends answerable while anybody is still asking about that handover. All of this runs inside the one process, so self-hosting still needs no cron job, and a missed pass costs disk rather than correctness.

Creating, opening and asking about a secret now have a pace. There is no CAPTCHA and no third-party bot check, because zero third-party requests is a claim this site invites you to check in a network panel, so abuse is bounded structurally instead: one-time links, a 72 hour ceiling, size caps, a limit per caller and one more across the whole instance for creates. Every number is yours to change in one place, and the defaults are far past what sending a link looks like.

Meeting one of those limits is an ordinary thing rather than an error, so it reads like one. Nothing is stored, nothing is shared, nothing is spent, and the secret is still in the tab you are looking at. The page says which limit it was, because "you are going faster than we take" and "we are full right now" are different facts and one of them is not about you, and it says how long to wait using the instance's own number rather than a vague moment. When something in between refuses instead, and names no reason, the page names none either.

A recipient who is metered stays exactly where they were, on a link nobody has spent, with the same button. A sender who re-checks their history too often keeps every row and is told why nothing moved: the list is as old as the line above it already says it is. If the very first check of a page load is the one that gets refused, the history says it has links and could not find out about them, rather than disappearing, because disappearing is what having sent nothing looks like.

The counters stay four numbers a day: creates, opens, burns, expiries. No address, no secret id, nothing joining a request to a person. The rate limits are the one place an address is touched at all, and they hold it in memory for minutes, never on disk, dropped the moment the caller has their allowance back and never for longer than a day.

### Run it yourself

You can run this yourself, and you can check what it claims.

The repository now carries the whole story a stranger needs. A README that leads with the caveat rather than burying it, because "anyone holding the whole link can decrypt it" is the first thing an evaluator should read. A self-hosting guide with the thing that would otherwise waste your afternoon at the top: the encryption happens through the browser's Web Crypto, which browsers only expose over HTTPS or on localhost, so an instance served over plain HTTP on a real hostname cannot encrypt at all. A threat model that goes adversary by adversary and names what each one gets, including the two that are uncomfortable: an operator can serve you different code, and minimal logging means we could not help you investigate an abuse report. And a page about the licence, which is AGPLv3, and which mostly means: run it unmodified and you owe nobody anything.

Alongside those, the ordinary furniture of a repository somebody else can arrive in. How to report something and what we will do about it, with no bounty programme and no pretending there is one. How to contribute, starting with the scope sentence, because a pull request that adds a settings panel is going to be turned down however good the code is. A changelog. The licence itself.

The claims are now checked on every commit rather than remembered. The pages and the stylesheet they ship fetch nothing from another origin and run nothing inline; no surface makes a claim we are not allowed to make, the words we are only allowed to deny have to sit in a sentence that denies them, and neither "end-to-end" nor "zero-knowledge" may appear out of sight of the caveat that anyone holding the whole link can decrypt; the URL fragment is touched in two named places and a third would fail, which is that rule in one greppable line; the header bundle rides every class of response, including the real built pages served the way the container serves them; `.env.example` documents every variable the process reads, and the process reads them in one place; and every repository destination the footer points at is a file that exists, so a trust link cannot quietly rot into a 404.

Each of those checks has been pointed at a violation on purpose and watched to fail, because an audit that has only ever been green proves that it ran rather than that it works.

### The whole thing driven

The whole product is now driven all the way through before anything ships, in the container people actually run.

Three handovers, in a real browser, against the built image rather than a dev server. A secret with a note, a login and a file goes from one browser to another: the sender copies the link, a recipient who has never sent anything opens it once, takes one field on its own and then everything in a single press, and the file that lands on the disk is the file that left, byte for byte. Then the same with a password, including one wrong try, which spends the link and leaves the encrypted secret in the recipient's tab to try again. Then a burn, where the sender destroys a sealed secret and the stranger who opens the link afterwards is told the sender did it rather than that somebody read it. The key travels through a real address bar and is gone from it before anything else happens, which is the one thing no test outside a browser can watch.

The moves are held to the durations the design fixes them at. The envelope goes quiet while the browser encrypts, the secret uncovers over 520 milliseconds, and a wrong password plays the burn instead, with its arrival held behind the dissolve so finality reads as stillness. A reader who has asked their system for less motion gets all of it collapsed, and the pause the burn was built around goes with it.

Pages arrive faster, and a crawler asking about them gets a straight answer. Everything text-shaped now leaves the instance compressed, and it is the process's own job rather than something a self-hoster has to put a proxy in front of to get: measured over a simulated phone connection, it takes the homepage from arriving in four and a half seconds to arriving in two and a half. There is a `robots.txt`, which asks crawlers to leave secret addresses alone and, before this, was a request that quietly returned a web page. The two static pages carry a description, written from their own words.

All of it is a gate on every commit, at 95 or better on the homepage and on a sealed secret. Two things about that number are worth saying plainly. It is Lighthouse's desktop configuration: over its simulated phone connection the homepage reaches 92, held there by the size of the bundle and the three self-hosted typefaces rather than by anything the gate could fix. And one automated accessibility check is set aside, because it fails on the design system's quietest ink, and lightening that is a decision about how the whole product looks rather than a fix. Both are written down where they are done, and the gate insists that check is the only one set aside, so the exception cannot widen without somebody saying so out loud.

### The mark arrives

The product wears its mark. The teal dot beside the name was always a stand-in, and the curved sweep chosen off the mark studies now stands in its place, in the header of every screen and in the browser tab.

The tab icon is an SVG served from this instance, like the fonts, so a tab still costs nothing from anybody else's server. It carries the accent colour spelled out, because a static icon has no stylesheet to read a token from.

The mark keeps the three tapering points it was drawn with rather than being blunted to survive small sizes. They hold down to about 24px, and on a standard-resolution display a 16px tab icon reads more as a shape than as the drawing.

### The logo goes home

The logo takes you home. It was already a link on the security page and nowhere else, so on the page a recipient lands on there was no way back to the product except the browser's own back button.

It is a real link rather than a click handler, so it can be middle-clicked, copied, and opened in a new tab like any other address.

### Nothing moves under the press

Nothing moves under the press any more.

Every control that reports what it just did used to resize while doing it. Create link is wider than Locking…, Take everything is wider than Taken, Copy is narrower than Copied, and each of those sits at one end of a row that lays itself out around it, so the word changing pulled its neighbours across the screen at the exact moment you were reading them to find out whether the press had landed. Each of those controls now reserves the room for every word it can say, so the word changes and the layout does not. It is the same reservation the expiry setting has always made, met one scale down.

The recipient's page no longer re-centres itself at the end of a move. It shows one screen at a time and centres it, and while a screen is being replaced both are on the page at once, so the page was as tall as the taller of them and then dropped to the height of whichever one stayed. That drop landed a beat after the press: the secret would finish its uncover and then jump, and pressing "I've saved it" moved the whole page by about 170 pixels. The screens now share one stage the height of the room available, so eleven different screens arrive at one height and nothing shifts behind them. A screen taller than the room still grows it and scrolls like any other page.

Asking for a password used to move the page as the envelope started encrypting: the two lines explaining the password closed themselves, taking 40 pixels out of the page in the one moment nothing should move. They now dim along with the panel they belong to, which is what the dim was always saying.

The room a scrollbar takes is now always reserved, so a screen crossing the viewport's height no longer shifts the whole page sideways on the platforms that give scrollbars room of their own.

A file appears the moment you attach it. Reading one is not instant, and a big file on a phone took long enough that the press looked ignored, so the row now lands straight away with the name and the size the picker gave, and the bytes fill in behind it. Nothing about what gets sealed changed: the read still starts the instant you attach, so a file edited on disk afterwards cannot alter what goes in the envelope, and a press that arrives while a file is still being read waits for it rather than sealing an envelope with a hole where that file should be. A file that cannot be read still takes its own row back off the screen and says so, and still leaves the rest of the envelope exactly as it was.

Attaching is refused for the length of the lock, at both widths. The press has already decided what it is sealing, so a row that arrived after that decision would have been a part you watched attach and then never received.

### A link says what it is

A link to this product now arrives with a face on it.

Pasting a secret's link into a chat used to produce a bare address with the key cut out of the middle of it, which reads like something a careful person should not click. It now unfurls as a card: the mark, "Someone sent you a secret.", and the sentence the page behind it opens with. The words are the reveal screen's own, quoted rather than written again for the occasion, and the picture is drawn from the same tokens and the same font files the product serves.

That card is one static picture for every secret there is. It says what the link is and never whether it is still live, so nothing about a particular secret is in it and nothing about it changes once the secret has been opened. The preview is fetched without the key, because no client sends a fragment to a server, and loading the page has never consumed anything: only the reveal press does. A chat window drawing a card cannot open what it points at, spend it, or say anything about it.

A secret's address keeps everything it had. It is still noindex in the document and in the header, still disallowed in `robots.txt`, and it is given no canonical address, because one file is served for every secret and any address written there would be a lie about all but one of them.

The homepage and the security page get the same treatment plus the parts a search result reads: a card, a canonical address, and the description each page already had.

Every instance names itself. The absolute addresses in a card are filled in from the request as the document goes out rather than baked in at build time, so an instance you run points at your own domain, for the picture and for the page, and never at ours.

### A file we do not have

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

### A front door for the rest

There is an `/integrations` page now, and it is an inventory rather than a pitch. Three entries, Slack, the command line and macOS, each with the word `planned` beside it, because none of them exists yet. When one ships its word becomes `available` and the page says so on the same day the changelog does. There is nothing to sign up to and no dates anywhere: the list is there so you can see what is real today rather than what we hope will be real later.

It opens with the thing an integrations page is most tempted to fudge. A secret is still typed and locked in a browser tab, because that is the only place the key can exist without us seeing it. What an integration changes is where the errand starts and where the finished link lands, and nothing in between.

The nav on every page is now the same three destinations, Integrations, Security and Self-host, at every width rather than hiding the last one on a phone. The page you are standing on is named without being a link to itself.

### A door in the channel

SecureSend answers `/ss` in Slack now. You type it in a channel, and a private reply nobody else can see offers one button. The button opens a SecureSend tab with the caret already in the field, because you pressed Enter thirty seconds ago to get here and that muscle is still warm. Type the secret, press Enter again, and the link is in the channel before you have finished reading the receipt.

The bot never sees your secret, and the reason is structural rather than a promise. There is no field in Slack that takes one: `/ss` is a door, not a form, and anything you type after it is dropped on arrival and never stored, logged or repeated back. The locking still happens in your browser, and the finished link is posted to the channel by that same browser through a one-time reply handle Slack attaches to your own command. It goes to Slack without going through us. The honest caveat has not moved: anyone holding the whole link can open the secret, and the link is now sitting in a channel, so send it to the channel you meant.

Two messages arrive, not one, and the split is deliberate. The channel gets the link, written out whole so it survives being copied as well as clicked, and it carries no buttons and is never edited afterwards. You privately get the buttons: stretch the expiry to 48 or 72 hours, or burn it now. Slack hands an app the entire message a button was pressed on, so a button sitting next to the link would have handed us the key on the first press. Keeping them apart is what stops that. It has a visible cost and it is not a bug: burn the secret and the post above still says what it said, because correcting it would mean sending the key again. The private message is what tells you the truth afterwards, and it says so.

The app asks for one permission, `commands`, so it can answer `/ss`. Nothing for posting, nothing for reading your channels, your history or your files. There is an `/integrations/slack` page laying all of this out, and the Slack row on the integrations index now reads `available`.

Self-hosters get the same thing for nothing. The repository ships an app manifest you point at your own instance, and `SLACK_SIGNING_SECRET` is the only value your instance needs. No client id, no secret, no account with us.

### The terminal joins

You can send and open secrets from a terminal. `npm install -g securesend` puts one command on your path, and it seals and opens with the exact code the browser runs, imported byte for byte, on Node's own Web Crypto. `securesend create` takes a note from stdin or `--text`, files with `--file`, an optional password it prompts for and never takes as an argument, and prints the link alone on stdout so it pipes. `status` asks without consuming, `reveal` prints text and writes attachments beside you, and `burn` destroys a sealed secret early with the token create handed you.

The verb for agents and scripts is `run`: it opens the secret in-process and hands the plaintext to a child command as an environment variable you name, so it never touches stdout, disk, or a transcript. If the command fails, the plaintext is still in memory, so the CLI re-seals it as a fresh secret with the same password and prints the new link: a failed run does not destroy the secret. `securesend skill` prints a guide written for coding agents, bundled from the same file the repository publishes.

With this release the four routes underneath, create, status, reveal and burn, are public API, documented in docs/api.md and held to the product's semver: the CLI is their first client outside the browser. Everything points at securesend.dev by default and at your own instance with `SECURESEND_URL` or `--instance`.

### The terminal has a page

The integrations page reads `available` on the command line row now, with a page of its own behind it at `/integrations/cli`. It walks the whole errand in the four lines it actually takes: install the command, pipe a file into `securesend create` and get the link back on stdout alone, ask `status` whether the secret is still sealed, and open it with `reveal`. The expiries, and the password that is prompted for rather than passed as an argument, are on the page beside them.

There is a section for the case where the thing needing the secret is a process rather than a person. `securesend run <link> --as NAME -- <command>` puts the plaintext in the child's environment and never in a transcript, and reseals under a fresh link if the command fails, and the page says plainly how narrow that guarantee is: nothing beyond it is claimed, and anyone holding the whole link can still open the secret. `securesend skill` prints the guide an agent can read straight out of the binary.

Pointing the command at your own server is one variable, `SECURESEND_URL`, and opening a link needs nothing at all, because a link carries the origin that sealed it. Only macOS is left on the index reading `planned`, and that paragraph now says so in the singular.

# Threat model

The [security page](https://securesend.dev/security) is the summary. This is the
long form: what the design assumes, who it defends against, and where it stops.
It is written so you can disagree with it on specifics rather than on vibes.

If this document and the code disagree, the code is right and this is a bug.
Report it to security@securesend.dev.

## What is being protected

One secret, in transit, between two people who already know each other and
already have a channel to talk in. A password, an API key, a VPN profile, a set
of recovery codes, a small file.

The threat that motivates the product is mundane and specific: that channel keeps
a copy forever. A credential pasted into Slack is in Slack's search index, in
whatever mailbox the notification went to, in a laptop backup, and in the
retention window of whoever administers the workspace. The secret outliving the
handover by years is the thing being fixed.

What is not being fixed: long-term storage, sharing with a group, access control,
audit trails. Those are different products.

## The design

Your browser generates a 256-bit AES key. It encrypts the envelope, and each
attached file separately under the same key, with AES-256-GCM through Web Crypto.
It sends the ciphertext to the server. It puts the key in the URL fragment, the
part after the `#`, which no browser sends in any request.

The link is `https://securesend.dev/s/<id>#<token>`.

- `<id>` is 128 bits of randomness the client picks, 22 base64url characters. The
  server inserts it or rejects the collision.
- `<token>` is one opaque blob: a version byte, a flags byte, the 32-byte key,
  and a 16-byte salt only when the password flag is set. 46 characters without a
  password, 67 with one.

The recipient's browser reads the fragment, scrubs it out of the address bar with
`history.replaceState`, asks the server for status, and shows a sealed panel.
Nothing is consumed yet. When the recipient presses the button, one transaction
claims the row, returns the ciphertext, and scrubs it before committing. The
decryption happens in that browser.

Two details that are load-bearing:

- **The password flag rides the fragment, not the server.** The server cannot
  tell which envelopes are password-protected, because the flag and the salt are
  inside the token it never sees.
- **The id is bound into every ciphertext as AES-GCM additional authenticated
  data** (`securesend:v1:envelope:<id>`, and `securesend:v1:attachment:<id>:<n>`
  for files). Moving a ciphertext to another row makes it fail authentication, so
  an operator cannot swap what a link decrypts to.

## What the server holds

For a sealed secret: the envelope ciphertext and its IV, one ciphertext and IV
per attached file, a SHA-256 of the management token, and four timestamps
(created, expires, used, burned) of which the last two are null.

For a dead one: the timestamps and a burn reason. The ciphertext columns are
nulled and the attachment rows are deleted, so a tombstone cannot even say how
many files there were. Seven days past expiry the row is deleted outright.

Instance-wide: four counters per day. Creates, reveals, burns, expiries. No id,
no address, nothing joining a request to a person.

Never, anywhere: a key, a password, a filename, a MIME type, a plaintext byte,
or an IP address written next to a secret id.

## Adversaries

### Someone who has the whole link

They get the secret. This is not a weakness to be mitigated, it is the design:
the link **is** the secret, and it is the caveat that has to sit next to every
use of the words "end-to-end" or "zero-knowledge" on any page we write.

It is why the link should travel like a credential, why the password option
exists for when the channel carrying the link is the part you do not trust, and
why one-time semantics matter: a link that has been used is spent, so an
interception is at least detectable. The person who should have received it
arrives to find the envelope already gone.

### The instance operator, or anyone who dumps the database

Ciphertext, IVs, timestamps, and token hashes. No key material of any kind. A
full database dump decrypts to nothing.

What an operator does learn: that a secret exists, roughly how big it is, when it
was created, when it expires, and when somebody spent it. They cannot tell whether
a password protects it, what kind of thing it is, or what the files are called.

What an operator can do: destroy things. They can delete rows, and they can serve
different code to the next visitor. That second one is the real limit and it has
its own section below.

### A network observer

TLS in transit, and the fragment is never in transit at all, so the key is not on
the wire even in a world where TLS fails. An observer sees that an address talked
to the instance and roughly how many bytes moved.

### A link-preview bot

Slack, Teams, iMessage and WhatsApp all fetch a link before a human sees it. That
fetch lands on `GET /api/secrets/<id>`, the status route, which reads and never
mutates. Nothing is consumed. A bot also never has the fragment, because it is
not sent, so even a bot that ran our JavaScript would have no key.

This is the reason revealing is an explicit press rather than a page load. It is
the failure mode that makes one-time-secret tools quietly useless.

### Cloudflare, or whatever CDN is in front

Our hosted instance sits behind Cloudflare, which terminates TLS. It therefore
sees IP addresses, paths, and ciphertext. It never sees a fragment, because no
browser sends one, and it never sees plaintext.

A self-hosted instance can have no CDN at all. That is one of the reasons
self-hosting is a first-class path rather than a gesture.

### Someone guessing ids

128 bits, client-generated, from `crypto.getRandomValues`. Guessing one is not a
thing that happens. And a correct guess without the fragment yields a sealed panel
and, if pressed, ciphertext that cannot be decrypted, while burning the secret for
its real recipient. That last part is a real denial-of-service against a specific
secret, and it costs the attacker a 128-bit guess, so it is priced out rather than
prevented.

### Someone with the link but not the password

The password composes with the link key. It stretches through PBKDF2-HMAC-SHA256,
600,000 iterations, over the 128-bit salt the fragment carries, and the result is
HKDF-SHA256-combined with the fragment key under a versioned label to make the
data key. So the link alone is useless, the password alone is useless, and the
database alone is useless.

There is no verifier on the server. We cannot tell a right password from a wrong
one, which has three consequences we state plainly rather than hide:

- A wrong attempt still spends the link, because the press is what consumes it.
  The page says so before the press.
- Retries happen in the recipient's tab, against ciphertext that is now only
  there. There is an honest count of attempts and no limit, because we cannot
  rate-limit what we cannot verify, and a fake limit would be theatre.
- An attacker who holds the link and takes the ciphertext can guess offline at
  whatever rate their hardware allows. The KDF is the only thing slowing them
  down. A weak password loses.

### The recipient

One-time means one delivery. It does not mean the recipient cannot screenshot,
paste, forward, or remember. Nothing in this product or any other constrains a
person you chose to send a secret to.

### The sender's own device

The browser that created a secret keeps three things in local storage: its id,
its expiry, and a management token. A row is dropped seven days past that expiry,
and at most fifty are kept. That is the whole of a sender's relationship with what
they sent, and it is what lets the homepage show a history without the server
holding one.

It deliberately does not keep the key. The remembered link is the link without
its fragment, so a sender's own history cannot re-leak a secret, and a management
token cannot decrypt anything: it is 256 bits of unrelated randomness, and the
server keeps only its SHA-256.

Anyone with access to that browser profile can burn what it sent. Nobody with
access to it can read what it sent.

### Us, serving you the code

This is the honest limit of all browser cryptography and it cannot be argued away.

You are trusting the JavaScript we serve at the moment you use it. We could serve
you a build that posts the key. We cannot prove to you that we have not, and no
amount of open source alone proves it either, because the code you read and the
code you were served are two different artifacts.

What we can do, and do:

- Keep the whole thing open, under a licence that keeps modified versions open.
- Keep the cryptography in one small package with zero runtime dependencies, so
  the part you actually have to read is readable in a sitting.
- Serve no third-party script, ever, so the set of parties who could tamper is
  us and nobody else.
- Make self-hosting genuinely uncrippled, so "do not trust them" is a practical
  option and not a rhetorical one.

If your threat model includes us, self-host. That is the correct response and we
would rather say so than pretend the problem away.

### A compromised dependency

`packages/crypto` has zero runtime dependencies, by policy. A dependency
appearing there is treated as a policy failure rather than a tradeoff, because it
would widen exactly the surface the previous section is about.

The web app and the API do have dependencies, and a compromised one there could
reach the page context where the key lives. Nothing about being open source fixes
this; it is the same trust as the section above, spread over more parties. The
mitigations are ordinary: a lockfile, few dependencies, and no runtime code
fetched from another origin at any point.

### A legal request

We would have very little to hand over: ciphertext for anything still sealed,
some timestamps, and nothing that ties a secret to a person. We could not decrypt
anything and we could not say who opened what.

This cuts the other way too, and it is a trade rather than a win. Minimal logging
means weak forensics. If something bad happens through the service, we cannot
help you find out who did it. Recipient privacy wins that argument in this
product, and the tension is real.

## Abuse

We cannot scan what we cannot read, and we would rather keep it that way. So
abuse control is structural rather than inspective:

- One-time links. A hosted file that dies on first fetch is a bad hosted file.
- A 72-hour ceiling on every link, with no way to extend it.
- Size caps: 256KB of envelope, 10MB total, enforced on both sides.
- Per-address token buckets on create, reveal and status, plus a global creation
  watermark so a flood from many addresses is bounded too.
- No CAPTCHA and no bot check, because both mean third-party JavaScript in the
  page context where the key is born. That is the one place it cannot go.

abuse@securesend.dev is read by a human and we can kill a reported link.
Reporting one grants nobody anything they did not already have, since anyone
holding a link can already destroy it by opening it.

## Accepted weaknesses

Named, because a threat model that only lists strengths is marketing.

**PBKDF2 rather than Argon2id.** Argon2id is the better algorithm: memory-hard,
and roughly a hundred times fewer guesses per second on a GPU. Browsers do not
ship it, so using it would mean serving a third-party WASM blob on exactly the
page whose pitch is that it carries no third-party code. We took the weaker KDF
and the stronger page. The fragment token carries a version byte, and links
expire within 72 hours, so this can change without a migration.

**A weak password is a weak password.** 600,000 iterations buys time, not
security, against a guessable one. The product does not currently generate one
for you; that is a known gap rather than a position.

**No forward secrecy.** There is one key per secret and it lives in the link for
the link's life. Ciphertext captured now plus the link later is readable. The
72-hour ceiling is what bounds that window.

**The limiter resets on restart.** It is in-process memory, on purpose, so that
"nothing keyed to an address outlives a day" stays true without a second service
holding addresses. A deploy hands everybody a fresh bucket.

**Restoring a backup can resurrect a spent secret.** A reveal destroys the
ciphertext, but a backup taken before it still holds those bytes. See
[self-hosting.md](./self-hosting.md#backups).

**Timing and size are not hidden.** The row size tells an operator roughly how
much you sent, and the create and reveal timestamps tell them when. We are not
padding to a fixed size and we are not claiming metadata resistance.

**We have not had an external audit.** We are not SOC 2 certified and we make no
HIPAA claim. When any of that becomes true it will appear here and on the security
page with the name of who did it and a date. Until then the substitute on offer is
that the code is small, open, and dependency-free where it counts.

## Out of scope

Not defended against, and not claimed to be: your device, your clipboard, your
browser extensions, malware, a compromised recipient, a coerced recipient,
shoulder-surfing, and anything that happens after a secret has been taken out of
the envelope and put somewhere real.

## Reporting

security@securesend.dev. No bounty programme, no NDA, and no legal threats for
good-faith research. See [SECURITY.md](../SECURITY.md).

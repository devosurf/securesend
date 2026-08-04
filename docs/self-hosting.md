# Self-hosting SecureSend

The hosted instance runs this repository, from this Dockerfile, with nothing
added. There is no licence key, no paid tier, and no feature that only works on
our machine. If you run it yourself you have the whole product.

## What you are running

One Node process and one Postgres database.

The process is the Hono API, and in production it also serves the built web app
from its own `public` directory, so a browser talks to one origin and there is no
CORS anywhere. Migrations apply when the process boots. Expired secrets are
destroyed by an interval inside the same process, so there is no cron job to
install and nothing to schedule.

That is the whole architecture. No Redis, no queue, no object storage, no worker,
no second container beyond the database.

## Quickstart

You need Docker.

```sh
git clone https://github.com/devosurf/securesend.git
cd securesend
cp compose.example.yaml compose.yaml
# change the two matching passwords in compose.yaml
docker compose up
```

The app is on <http://localhost:3000> when the build finishes. First build takes
a few minutes because it compiles the web app; after that it is cached.

`compose.yaml` is gitignored, so the password you put in it stays out of commits.

## Serve it over HTTPS, or it will not work

This is the one thing that will waste your afternoon, so it is here rather than
further down.

The encryption happens in the browser, through the browser's own Web Crypto API.
Browsers only expose that API in a **secure context**: HTTPS, or `localhost`.
On `http://192.168.1.10:3000` or `http://secrets.example.com` there is no
`crypto.subtle` at all, and sealing an envelope throws instead of working.

So `localhost` is fine for trying it, and anything else needs a certificate. Put
a reverse proxy in front that terminates TLS: Caddy, Traefik, nginx, or a
platform that does it for you. Point it at the app's port and let it handle the
certificate.

Two things to set on that proxy:

- **Pass the real client address.** The rate limiter uses the socket address by
  default, which behind a proxy is the proxy. Set `CLIENT_IP_HEADER` to the
  header your proxy writes, and read the warning on it in `.env.example` first:
  a header a client can send is a rate limit a client can walk around, so only
  name a header your own proxy always overwrites on the way in.
- **Do not cache anything.** The API already sends `Cache-Control: no-store` on
  every response, so a well-behaved cache will leave it alone. If your proxy
  caches by path rather than by header, exclude `/api/*` and `/s/*`.

## Configuration

Every variable, what it does, and why the default is the default, lives in
[`.env.example`](../.env.example). That file is the reference; this section is
only about how the values reach the process.

With compose, put them under `environment:` in your `compose.yaml`. Everything
except `DATABASE_URL` has a working default, so the shortest possible
configuration is the connection string and nothing else.

The one variable worth deciding on deliberately is `MAX_TOTAL_BYTES`, because it
decides how much disk this instance can be holding. Read it together with
`INSTANCE_CREATE_PER_HOUR`: at the defaults and a 72 hour ceiling, the most that
can be alive at once is about 21,600 secrets. If that many at your size cap is
more disk than you have, lower one of the two.

## The rate limiter is in this process's memory

There is no Redis here and no third-party bot check, so the limiter is a set of
token buckets in the process's own heap. Three consequences, and all three are
deliberate:

- **It does not survive a restart.** A deploy hands every caller a full bucket.
- **It does not span containers.** Run two and you have two limiters, and the
  numbers in `.env.example` are then per container rather than per instance.
- **It forgets.** An entry is dropped as soon as the caller has refilled, and no
  entry lives longer than a day whatever it is doing.

The third one is the reason for the first two. "Anything keyed to an IP address
expires within 24 hours" is a claim on the security page, and memory that is
never written to disk is the simplest way to keep it true. A shared limiter would
mean a second service holding addresses, which is a worse trade than a limit that
resets on deploy.

If you need a hard edge in front of this, put it on your proxy. That is where a
network-level limit belongs anyway.

## Backups

What a backup of this database contains:

- Ciphertext for every secret that is still sealed, and the IVs beside it.
- Tombstones: a status and its timestamps for secrets that were used, burned or
  expired within the last seven days.
- Four counters per day: creates, reveals, burns, expiries.

What it does not contain: any key, any password, any filename, any plaintext, and
no IP address anywhere. A stolen backup is bytes nobody can read.

One property to understand before you restore one. Death in this product is
crypto-shredding: a reveal destroys the ciphertext in the same transaction that
hands it over. A backup taken before that reveal still holds those bytes. So
restoring an old backup can bring an envelope back to life that somebody had
already opened, and the recipient who holds the link could open it again. That is
not a bug you can fix in the restore; it is what a point-in-time copy of a
one-time secret means. Keep backup retention short, and treat a restore as a
decision rather than a routine.

## Upgrading

```sh
git pull
docker compose up --build
```

Migrations apply on boot, so there is no separate step. Read
[`CHANGELOG.md`](../CHANGELOG.md) first: it is written as prose about what
changes for the people using your instance.

The version is a single number across the whole workspace, so an upgrade is one
decision rather than three.

## Sizing

Small. One Node process serving a static build and a few Postgres queries per
secret.

- **CPU.** The expensive cryptography happens in your users' browsers, not here.
  A shared vCPU is plenty.
- **Memory.** 512MB for the app is comfortable. Note that a create request holds
  the whole envelope in memory while it decodes and inserts it, so the real floor
  scales with `MAX_TOTAL_BYTES` and how many creates land at once.
- **Disk.** `MAX_TOTAL_BYTES` times the most secrets that can be alive at once,
  plus room for Postgres itself. See the note under Configuration.

## What is deliberately not here

Nothing to configure, because none of it exists: no SMTP, no accounts, no OAuth,
no S3 or other storage driver, no admin panel, no analytics, no telemetry of any
kind, no phone-home. The instance makes no outbound network request except to its
own database.

Files are stored as `bytea` in Postgres rather than in object storage. At the
10MB cap that is the right call, and it is the reason a self-hosted instance
needs one database and nothing else.

## Changing it

The core is [AGPLv3](../LICENSE), which matters most in the case that applies
here: if you modify it and let other people use it over a network, you owe those
people your modified source. Running an unmodified copy for your own team obliges
you nothing. See [why-agpl.md](./why-agpl.md).

Nothing in the product is behind a licence check, so there is nothing to defeat.
Changing the wordmark means editing the code, which is allowed and which the
licence asks you to publish if you are offering it as a service.

## Verifying it does what we say

Do not take our word for it. From your own instance:

```sh
# The headers the security page tells you to check.
curl -sI https://your-instance/ | grep -iE 'content-security-policy|referrer-policy'

# Everything the page fetches, which should be two relative paths and nothing
# else. The github.com links further down the document are destinations you can
# choose to follow, not requests the page makes, which is why this looks at
# script and link tags rather than at every href.
curl -s https://your-instance/ | grep -oE '<(script|link)[^>]*(src|href)="[^"]*"'
```

Then open a secret link with your network panel on. The part after the `#` is not
in any request, because no browser sends a fragment. That is the whole
zero-knowledge claim, and it is observable rather than asserted. It is also the
whole of its boundary: anyone holding the whole link has the key, so your instance
protects the secret from everyone except the people you send the link to.

CI runs the same checks on every commit as a claims audit: no off-origin fetch in
the rendered pages or the stylesheet, the required headers on every class of
response, no claim we are not allowed to make, and the URL fragment touched only
where it is meant to be. See [`scripts/claims/`](../scripts/claims).

## Related

- [threat-model.md](./threat-model.md), for what this protects against and what
  it does not.
- [why-agpl.md](./why-agpl.md), for the licence.
- [`packages/crypto`](../packages/crypto), which is the only part you have to
  read to believe any of it.

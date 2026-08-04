# SecureSend

Paste a secret, get one link, the link opens once.

The secret is encrypted in your browser before anything leaves it. The key rides
in the link's fragment, the part after the `#`, which browsers never send to a
server, so the instance holds bytes it cannot read. No accounts, no analytics, no
third-party scripts.

**Anyone holding the whole link can decrypt it. The link is the secret, so treat
it like one.** That caveat is the honest boundary of "end-to-end encrypted" here,
and it is why there is a password option for when the channel carrying the link is
the part you do not trust.

## Run it

You need Docker.

```sh
git clone https://github.com/devosurf/securesend.git
cd securesend
cp compose.example.yaml compose.yaml
docker compose up
```

That builds the image, starts Postgres, applies migrations on boot, and serves the
whole product on <http://localhost:3000>. First build takes a couple of minutes;
after that it is cached. Your `compose.yaml` is gitignored, so anything you put in
it stays out of commits.

The database password is one variable in that file, defaulted so the first run
needs no editing. Nothing publishes a Postgres port, so only the app can reach it.
Set a real one before the instance matters to anybody: the comment at the top of
`compose.yaml` is the two commands.

One thing to know before you put it on a real hostname: the encryption uses the
browser's Web Crypto API, which browsers only expose over HTTPS or on
`localhost`. Serve it behind a proxy that terminates TLS, or it cannot encrypt at
all. [docs/self-hosting.md](./docs/self-hosting.md) covers that and everything
else about running it.

## What it is

One Node process and one Postgres database, in one container. The same image the
hosted instance runs and a self-hoster builds. Nothing is paywalled and there is
no licence key.

- Expiry presets of 1, 24 or 72 hours. Nothing else to configure.
- One-time by construction: the reveal is a single transaction that hands over the
  ciphertext and scrubs it before committing. Loading the page consumes nothing, so
  chat preview bots cannot destroy what was sent to you.
- Optional password, composed with the link key rather than replacing it. There is
  no verifier on the server, so a wrong attempt fails in your own browser.
- Files up to 10MB total, encrypted separately, with their names inside the
  envelope's ciphertext. The instance never learns a filename.
- The sender's own browser remembers what it sent, without an account and without
  ever keeping a key, and can burn a sealed envelope early.

## Develop it

You need Node 22 and pnpm. Newer Node works for development; the container and CI
run 22, which is what we support.

```sh
cp .env.example .env
docker compose -f compose.dev.yaml up -d
pnpm install
pnpm dev
```

The web app comes up on <http://localhost:5173> and proxies `/api` to the API on
port 3000. The API applies migrations on boot, so there is no migrate step.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit:claims   # the claims audit, which reads what the build wrote
```

`pnpm test` needs the development database from `compose.dev.yaml`. Every
user-visible change lands with a changeset: `pnpm changeset`. See
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Layout

```
apps/web         Vite + React SPA
apps/api         Hono API, serves the web build in production
packages/crypto  client-side crypto, zero runtime dependencies
scripts/claims   the claims audit CI runs against the build
```

## Docs

- [docs/self-hosting.md](./docs/self-hosting.md), for running your own.
- [docs/threat-model.md](./docs/threat-model.md), for what this protects against
  and where it stops.
- [docs/why-agpl.md](./docs/why-agpl.md), for the licence.
- [SECURITY.md](./SECURITY.md), for reporting something.
- [CONTRIBUTING.md](./CONTRIBUTING.md), and [AGENTS.md](./AGENTS.md) for the rules
  a change has to hold to.
- [`packages/crypto`](./packages/crypto) is the only part you have to read to
  believe any of the above.

## Licence

[AGPLv3](./LICENSE). Run it unmodified and you owe nothing. Modify it and offer it
to other people over a network and you owe them your source.
[Why](./docs/why-agpl.md).

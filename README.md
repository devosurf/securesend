# SecureSend

**Status: half built.** You can seal an envelope and get a real link. Opening one
is not built yet, so what follows describes where this is going.

Paste a secret, get one link, the link opens once. The secret is encrypted in
your browser before anything leaves it, and the key rides in the link's
fragment, which browsers never send to a server. Anyone holding the whole link
can decrypt it, so treat the link as the secret.

No accounts, no analytics, no third-party scripts.

## Run it

You need Docker.

```sh
cp compose.example.yaml compose.yaml
# change the database password in compose.yaml
docker compose up
```

That builds the image, starts Postgres, applies migrations on boot and serves
the app on http://localhost:3000. Your `compose.yaml` is yours: it is ignored by
git, so the password you put in it stays out of commits.

## Develop it

You need Node 22 and pnpm. Newer Node works for development; the container and
CI run 22, which is what we support.

```sh
cp .env.example .env
docker compose -f compose.dev.yaml up -d
pnpm install
pnpm dev
```

The web app comes up on http://localhost:5173 and proxies `/api` to the API on
port 3000. The API applies migrations on boot, so there is no migrate step.

- `pnpm test` runs the unit tests and the API tests. The API tests need the
  development database from `compose.dev.yaml`.
- `pnpm lint`, `pnpm typecheck` and `pnpm build` are what CI runs.
- Every user-visible change lands with a changeset: `pnpm changeset`.

## Layout

```
apps/web         Vite + React SPA
apps/api         Hono API, serves the web build in production
packages/crypto  client-side crypto, zero runtime dependencies
```

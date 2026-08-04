# Contributing

## Read this part first

SecureSend does one job in ten seconds: you paste a secret, you get one link, the
link opens once. **Bloat is the failure mode that killed the previous version, so
when a change adds a setting, a mode, or a screen, the default answer is no.**

That is not a discouragement, it is the scope. A pull request that makes the one
job better, faster, clearer or more honest is very welcome. A pull request that
adds folders, retention policies, team accounts, a dashboard, or a preference
panel will be turned down even if the code is good, and it is kinder to say that
here than after you have written it.

If you are not sure which kind yours is, open an issue first and ask. One
paragraph is enough.

Three rules that are not negotiable, because the product's claims depend on them:

1. **The key never reaches the server.** Not in a request, not in a log, not in an
   error report, not in analytics that do not exist. Encryption happens in the
   browser and the key travels only in the URL fragment. The boundary of that, which
   every page has to keep in view: anyone holding the whole link can decrypt it.
2. **`packages/crypto` has zero runtime dependencies.** A dependency appearing
   there is a policy failure, not a tradeoff.
3. **Nothing loads from another origin.** No script, font, style or image. "Zero
   third-party requests" is a claim the security page invites a reader to check in
   a network panel, so it has to stay literally true.
4. **A strong label never travels without its caveat.** "End-to-end" and
   "zero-knowledge" are both true here in a specific sense and read as a much bigger
   promise, so neither may appear out of sight of the sentence in rule 1. The claims
   audit enforces this, on the pages and in these documents.

The rest of the working agreement is in [AGENTS.md](./AGENTS.md), which is short
and worth the two minutes whether or not you use an agent.

## Setup

Node 22 and pnpm. Newer Node works for development; the container and CI run 22,
which is what we support.

```sh
pnpm install
cp .env.example .env
docker compose -f compose.dev.yaml up -d
pnpm dev
```

The web app comes up on <http://localhost:5173> and proxies `/api` to the API on
port 3000. Migrations apply when the API boots, so there is no migrate step.

If you would rather not run Docker, point `DATABASE_URL` at any Postgres you have.

## Checks

```sh
pnpm lint           # Biome, via the Ultracite preset
pnpm typecheck      # TypeScript at maximal strictness
pnpm test           # unit tests, plus the API tests against the dev database
pnpm build          # what the container builds
pnpm audit:claims   # the claims audit, which reads what the build wrote
pnpm smoke          # the browser gate, over the container it builds
```

CI runs the first five in that order, and the sixth in a job of its own. All of it
has to pass. `pnpm lint:fix` fixes most style complaints for you.

The tests need the development database from `compose.dev.yaml` to be up. Some of
the crypto tests run in a real Chromium as well as in Node, so the first run
downloads a browser. The audit needs `DATABASE_URL` to be set, because it drives the
real API and the API validates its environment on import, but it never queries: it
passes with the database stopped.

`pnpm smoke` needs Docker and nothing else. It builds the image from your working
tree, brings it up with its own throwaway Postgres on port 3100, drives it, and
stops it again. It refuses to run against an instance that is already answering
there, because that instance was built from source that may not be yours: if a
killed run left one up, `docker compose -f compose.smoke.yaml down`.

## Where tests go

Four seams, and there is no component-test layer on purpose.

1. **The API boundary.** The Hono app driven fetch-style against a real Postgres,
   with migrations applied by the CLI. Real integrations, not mocks. Most
   behaviour belongs here.
2. **The crypto package's public API.** Pure unit tests, colocated, green in both
   Node and a browser.
3. **The browser's side of the wire.** `apps/web/src/compose`, `reveal` and
   `watch`, each driven at its own boundary. This is the only place the rule in
   Non-negotiable 1 can be asserted at all, because the API cannot check that a key
   stayed out of a request it never received.
4. **One thin Playwright smoke** over the built container, in `e2e/`, for what
   genuinely needs a browser: the fragment through a real address bar, the
   clipboard, a download, the durations the design fixes the moves at, and the
   Lighthouse score. Three journeys, and each one is a whole handover rather than a
   step.

Two things sit beside the four rather than inside them, and AGENTS.md explains why
each is a licence rather than an invitation. `apps/api/src/limits` drives its token
bucket on a clock the test passes in, because two of its properties are about
elapsed time. And the **claims audit** in `scripts/claims` is not a behaviour test
at all: it checks that what the product says about itself is still true. If you
change a claim on a page, expect to change the audit with it.

A good test exercises external behavior at a public boundary and would survive a
rewrite of everything behind it. If a test needs to reach inside a module to say
anything, that is usually the module's shape being wrong rather than the test's.

## Migrations

Generated, never hand-written:

```sh
pnpm --filter @securesend/api db:generate --name=what_it_does
```

Commit the generated SQL and the snapshot. They apply on boot, so there is nothing
to run against a running instance.

## Changesets

Every user-visible change lands with one:

```sh
pnpm changeset
```

Write it as **prose about what the reader experiences**, not as a list of commits.
Not "add attachment support" but a paragraph or three saying that an envelope can
carry files now, what happens when you drag one in, and what the instance can and
cannot see about it. The existing files in `.changeset/` are the register to match.

The three packages share one version, so pick the bump for the product rather than
per package. `minor` for something new a user can do, `patch` for a fix.

A change nobody using the product would notice, a refactor or a test, needs no
changeset.

## Style

Enforced by Biome, so mostly you do not have to think about it. What Biome cannot
check:

- **No em dashes.** Anywhere. Not in code, not in comments, not in docs, not in UI
  copy.
- Plain language, short sentences. Say the thing and stop.
- No decorative filler: no eyebrow or kicker labels above headings, no drop shadow
  cards, no comment that restates the line below it.
- Comments explain why, not what. This repository goes public and its whole claim
  is that a stranger can read it and believe us, so write for that stranger.
- Match the surrounding code's naming, comment density, and idiom.
- Delete dead code instead of commenting it out.
- Build the interface from `apps/web/src/styles` tokens and the `src/ui` kit, never
  from raw hex or a rebuilt control. Dynamic values are classes, never inline
  styles: the content security policy has no `unsafe-inline`, so a `style` prop
  would be silently dropped in production.

Commits are atomic, lowercase, imperative, and have no body. `keep the sender's
history when a check meets a limit`, not `Fix: history bug (#42)`.

## Security bugs

Do not open a pull request. See [SECURITY.md](./SECURITY.md).

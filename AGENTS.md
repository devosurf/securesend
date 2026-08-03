# AGENTS.md

## What this is

SecureSend does one job in ten seconds: you paste a secret, you get one link,
the link opens once. Encryption happens in the browser before anything leaves
it. No accounts, no analytics, no third-party scripts.

Bloat is the failure mode that killed the previous version. When a change adds
a setting, a mode, or a screen, the default answer is no.

## Non-negotiable

1. **Zero-knowledge.** Secrets are encrypted client-side with AES-256-GCM via
   Web Crypto. The key travels in the URL fragment and must never reach the
   server, a log, an error report, or any analytics. No exceptions.
2. **`packages/crypto` has zero runtime dependencies.** A dependency appearing
   there is a policy failure, not a tradeoff.
3. **Honest claims.** "Zero-knowledge" and "end-to-end" may appear only within
   sight of the caveat: anyone holding the whole link can decrypt. Never claim
   an audit, SOC 2, or HIPAA. They are not true.
4. **Single process.** One Node process (Hono serving the SPA build plus
   `/api`) and Postgres. No Redis, no queue, no websockets, no custom server.
   It must deploy as one container.
5. **Self-hosting stays uncrippled.** The core action is never paywalled and
   self-hosters keep their own branding for free.

## Stack

Vite + React 19 SPA, TanStack Router (file-based) with TanStack Query, Hono on
Node 22 with Hono RPC, Drizzle with Postgres (`pg` driver), Zod 4, Tailwind v4,
Biome (Ultracite preset), pnpm workspace. TypeScript at maximal strictness.

Not this project's tools: Next.js, Bun, Prisma, TanStack Start, barrel exports,
compatibility shims.

## Workspace

pnpm workspace, three packages:

- `apps/web`. Vite + React SPA, TanStack Router file-based routes. The generated
  `src/routeTree.gen.ts` is committed.
- `apps/api`. Hono. Owns the Drizzle schema and the migrations. In production it
  serves the web build from `./public` in the same process.
- `packages/crypto`. Consumed as TypeScript source inside the workspace, since
  both consumers bundle it, and built to `dist/` for the day it publishes. Bytes
  at its API are typed `Uint8Array<ArrayBuffer>`, because Web Crypto refuses a
  view backed by a SharedArrayBuffer and TypeScript now models that. A plain
  `Uint8Array` does not typecheck at a `crypto.subtle` call.

`pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`. Migrations
are drizzle-kit generated, never hand-written:
`pnpm --filter @securesend/api db:generate --name=what_it_does`. They apply on
boot, so there is nothing to run by hand.

Every user-visible change lands with `pnpm changeset`, written as prose about
what the reader experiences. The three packages share one version.

## Writing code here

This repo is written to be read. It goes public, and the product's entire claim
is that a stranger can audit it and believe us.

- **No em dashes.** Anywhere. Not in code, not in comments, not in docs, not in
  UI copy.
- Plain language, short sentences. Say the thing and stop.
- No decorative filler: no eyebrow or kicker labels above headings, no drop
  shadow cards, no comment that restates the line below it.
- Match the surrounding code's naming, comment density, and idiom.
- Delete dead code instead of commenting it out.
- Commits are atomic, lowercase, imperative, no body.

## Tests

Three seams, and no component-test layer:

1. **The API boundary**, primary. The Hono app driven fetch-style against a
   real Postgres with migrations applied by the CLI. Real integrations over
   mocks.
2. **The crypto package's public API.** Pure unit tests, colocated, green in
   both Node 22 and a browser runtime. `pnpm test` runs them in both. A test
   named `*.node.test.ts` is one that reads the repo itself, so it runs in Node
   only; everything else has to pass in the browser too.
3. **One thin Playwright smoke** over the built container, covering only what
   genuinely needs a browser: fragment handling, clipboard, downloads.

A good test exercises external behavior at a public boundary and would survive
a rewrite of everything behind it.

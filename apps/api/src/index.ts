import { join } from "node:path";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { applyMigrations } from "./db/migrate";
import { env } from "./env";
import { startJanitor } from "./janitor";

// src/index.ts and dist/index.js sit at the same depth, so this one path holds
// for `tsx watch` and for the built container.
const migrationsFolder = join(import.meta.dirname, "../drizzle");

await applyMigrations(migrationsFolder);

// After the migrations and before the first request, because its first act is to
// destroy whatever expired while this process was not running. It lives here rather
// than beside the app so that importing the app, which is what the tests do, never
// starts a timer nobody asked for.
startJanitor();

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`securesend listening on http://localhost:${info.port}`);
});

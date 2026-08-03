import { join } from "node:path";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { applyMigrations } from "./db/migrate";
import { env } from "./env";

// src/index.ts and dist/index.js sit at the same depth, so this one path holds
// for `tsx watch` and for the built container.
const migrationsFolder = join(import.meta.dirname, "../drizzle");

await applyMigrations(migrationsFolder);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`securesend listening on http://localhost:${info.port}`);
});

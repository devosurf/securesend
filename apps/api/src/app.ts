import { existsSync } from "node:fs";
import { serveStatic } from "@hono/node-server/serve-static";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "./db/client";
import { securityHeaders } from "./headers";

const WEB_BUILD = "./public";
const UNAVAILABLE = 503;
const NOT_FOUND = 404;

async function databaseAnswers(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch (error) {
    console.error("database unreachable", error);
    return false;
  }
}

const api = new Hono().get("/health", async (c) => {
  if (await databaseAnswers()) {
    return c.json({ status: "ok" });
  }

  // Thin on purpose: a public health endpoint says whether the instance can
  // serve, not what is wrong with it. The reason goes to the log.
  return c.json({ status: "unavailable" }, UNAVAILABLE);
});

// The bundle is first in the chain, so it rides every response the process can
// make: the api, the static build, and the 404s.
const app = new Hono().use("*", securityHeaders).route("/api", api);

export type AppType = typeof app;

app.all("/api/*", (c) => c.json({ error: "not found" }, NOT_FOUND));

// One container serves the built SPA from this same process. In development the
// build is absent and Vite serves the app instead.
if (existsSync(WEB_BUILD)) {
  // The two static pages are prerendered, so each one is a document the build
  // already wrote rather than a script tag that becomes one.
  app.get("/", serveStatic({ path: `${WEB_BUILD}/index.html` }));
  app.get("/security", serveStatic({ path: `${WEB_BUILD}/security.html` }));

  app.use("/*", serveStatic({ root: WEB_BUILD }));

  // Everything left is a client-rendered route, which in practice means a
  // secret's address. It gets the empty shell, never the homepage's markup.
  app.get("*", serveStatic({ path: `${WEB_BUILD}/shell.html` }));
}

export { app };

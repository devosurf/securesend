import { existsSync } from "node:fs";
import { serveStatic } from "@hono/node-server/serve-static";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { createMiddleware } from "hono/factory";
import { db } from "./db/client";
import { securityHeaders } from "./headers";
import { burn } from "./secrets/burn";
import { create } from "./secrets/create";
import { reveal } from "./secrets/reveal";
import { status } from "./secrets/status";

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

// Nothing the api says may be kept: these responses carry ciphertext, a
// management token, or a status that was true when it was asked for. A cache
// between here and the sender would be a copy of a secret's life nobody chose.
const noStore = createMiddleware(async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

const api = new Hono()
  .use("*", noStore)
  .get("/health", async (c) => {
    if (await databaseAnswers()) {
      return c.json({ status: "ok" });
    }

    // Thin on purpose: a public health endpoint says whether the instance can
    // serve, not what is wrong with it. The reason goes to the log.
    return c.json({ status: "unavailable" }, UNAVAILABLE);
  })
  .route("/secrets", create)
  .route("/secrets", status)
  .route("/secrets", reveal)
  .route("/secrets", burn);

/*
 * The two things every response goes through, in this order.
 *
 * The header bundle is first, so it rides every response the process can make: the
 * api, the static build, and the 404s. A header that only appears on the routes we
 * remembered is a header nobody can verify.
 *
 * Compression is second, and it is here rather than left to a proxy because a
 * self-hoster's whole deployment is this container. The documents and the bundle are
 * a few hundred kilobytes of markup, css and javascript; sending them raw costs a
 * phone about two seconds of the page's arrival, and nothing about doing it here is
 * a proxy's job this process cannot do.
 *
 * Hono skips what must not be touched: a range response, anything already encoded, a
 * HEAD, and anything under a kilobyte. Ciphertext is json and so is compressed too,
 * which is safe because the whole response is one secret's bytes: there is no
 * attacker-chosen text sharing the stream for a length to leak anything about.
 */
const app = new Hono()
  .use("*", securityHeaders)
  .use("*", compress())
  .route("/api", api);

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

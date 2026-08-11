import { existsSync, readFileSync } from "node:fs";
import { serveStatic } from "@hono/node-server/serve-static";
import { sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
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

/*
 * The one thing the build could not know: the address this instance answers on.
 *
 * A share card's image has to be named absolutely or no chat client will fetch
 * it, and the honest absolute name is whatever this instance is actually called.
 * Baking securesend.dev in at build time would put our address on every
 * self-hoster's cards and send their recipients' clients to our server for the
 * picture, which is the opposite of what shipping one container is for. So the
 * build writes this placeholder and the three documents are filled in as they go
 * out. Spelled the same in apps/web/social.ts, and the audit fails if the two
 * ever stop agreeing.
 */
const ORIGIN = "%ORIGIN%";

/** A scheme a forwarding proxy is allowed to claim. */
const HTTP = /^https?$/;

/**
 * What this instance is being called, from the request that arrived.
 *
 * The proxy in front terminates TLS, so the connection to this process is plain
 * http and the scheme has to come from the hop that knows. Only http and https
 * are taken from that header: everything here ends up inside an attribute, and a
 * header is a stranger's writing.
 */
function originOf(c: Context): string {
  const { host, protocol } = new URL(c.req.url);
  const forwarded = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const scheme =
    forwarded && HTTP.test(forwarded) ? forwarded : protocol.slice(0, -1);

  return `${scheme}://${host}`;
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
}

const HTML = "text/html; charset=UTF-8";

/**
 * One built file, read once at startup and named per request.
 *
 * Read once because these are small files that cannot change while the process
 * runs, and escaped on the way in because the host is whatever the request said
 * it was. The escaping is exactly right for the two markup types and inert for
 * the text one, where the only thing substituted is a hostname.
 */
function served(file: string, type: string): (c: Context) => Response {
  const template = readFileSync(`${WEB_BUILD}/${file}`, "utf8");

  return (c) =>
    c.body(template.replaceAll(ORIGIN, escapeAttribute(originOf(c))), 200, {
      "Content-Type": type,
    });
}

/**
 * A path whose last segment names a file.
 *
 * No route this application has contains a dot: there are three, and the only
 * variable part of any of them is a secret id, which is base64url. So a dot in
 * the last segment means a file was asked for, and if the static handler above
 * did not answer, that file is not here.
 *
 * Worth the rule rather than serving everything the shell, because a 200 is a
 * promise. A browser asking for /favicon.ico before it has parsed anything, a
 * crawler checking /sitemap.xml, a CDN caching by extension: each of them takes
 * a 200 at its word, and what they got was a page of markup filed under an
 * image. One of those quietly cost this site its icon in search results.
 */
const NAMES_A_FILE = /\.[^./]+$/;

// One container serves the built SPA from this same process. In development the
// build is absent and Vite serves the app instead.
if (existsSync(WEB_BUILD)) {
  // The two static pages are prerendered, so each one is a document the build
  // already wrote rather than a script tag that becomes one.
  app.get("/", served("index.html", HTML));
  app.get("/security", served("security.html", HTML));

  /* Both of these name the instance out loud, one in a Sitemap line and one in
   * every entry, so they are filled in on the way out rather than served off the
   * disk as the build left them. */
  app.get("/robots.txt", served("robots.txt", "text/plain; charset=utf-8"));
  app.get(
    "/sitemap.xml",
    served("sitemap.xml", "application/xml; charset=utf-8")
  );

  app.use("/*", serveStatic({ root: WEB_BUILD }));

  // Everything left is a client-rendered route, which in practice means a
  // secret's address. It gets the empty shell, never the homepage's markup.
  const shell = served("shell.html", HTML);

  app.get("*", (c) =>
    NAMES_A_FILE.test(new URL(c.req.url).pathname)
      ? c.text("not found", NOT_FOUND)
      : shell(c)
  );
}

export { app };

import { join, relative } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "./app";
import { closeDatabase } from "./db/client";
import { securityHeaders } from "./headers";

afterAll(closeDatabase);

/*
 * The bundle is a product claim, not hygiene: the security page tells a reader to
 * check these, so they are checked here on every class of response this process
 * makes. In this suite the web build is absent, so a page route is a 404, which
 * covers the class a header is likeliest to be missing from. The static class is
 * covered separately at the bottom, because a file handed back by the static
 * middleware is the other kind of response the headers have to survive.
 */
const ROUTES = [
  "/api/health",
  "/api/nothing-here",
  "/",
  "/security",
  "/s/7hK2mQ",
] as const;

describe("the security headers bundle", () => {
  it.each(ROUTES)("locks down %s", async (path) => {
    const response = await app.request(path);
    const policy = response.headers.get("content-security-policy");

    expect(policy).toContain("default-src 'self'");
    // Nobody can iframe a burn button.
    expect(policy).toContain("frame-ancestors 'none'");
    // No third-party anything, and nothing inline: the whole product's pitch.
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("style-src 'self'");
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");

    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it.each(ROUTES)("sets no cookie on %s", async (path) => {
    const response = await app.request(path);

    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("noindex", () => {
  it.each(["/s/7hK2mQ", "/s/7hK2mQ/anything"])(
    "keeps %s out of search",
    async (path) => {
      const response = await app.request(path);

      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
  );

  it.each(["/", "/security"])("leaves %s indexable", async (path) => {
    const response = await app.request(path);

    expect(response.headers.get("x-robots-tag")).toBeNull();
  });
});

/*
 * In production the pages and the assets are files, handed back by the static
 * middleware rather than built by a handler. The bundle is set after the rest of
 * the chain has run, so a response somebody else constructed is exactly where it
 * could fail to land. The migration this serves is a real file in the repo, so
 * the assertion is about a genuine 200 with a body.
 */
describe("a file off disk", () => {
  it("carries the bundle too", async () => {
    // The static middleware resolves its root against the working directory,
    // which is the api in the container and the workspace root under `pnpm test`.
    const root = relative(
      process.cwd(),
      join(import.meta.dirname, "../drizzle")
    );
    const files = new Hono()
      .use("*", securityHeaders)
      .use("/*", serveStatic({ root }));

    const response = await files.request("/0000_daily_counters.sql");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'self'"
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

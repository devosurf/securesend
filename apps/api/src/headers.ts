import { createMiddleware } from "hono/factory";

/*
 * The headers bundle, on every response this process makes.
 *
 * These are not hygiene. The security page tells a reader to check them, so
 * they ride the 404s and the static files too: a header that only appears on
 * the routes we remembered is a header nobody can verify.
 *
 * The policy is self only, with no escape hatches. `unsafe-inline` is the one
 * that would be easy to add and it is the one that matters most, because the
 * key is born in this page's context and an injected script there is the whole
 * game. Nothing inline means the build emits linked assets only, and the UI
 * carries no style attributes: every dynamic value in the interface is a class,
 * so styling needs no exception either.
 *
 * `object-src`, `base-uri` and `form-action` are none rather than self. The
 * product has no plugins, never rewrites its own base, and posts no forms, so
 * anything using them is not us.
 */
const POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/** A secret's address. Never in an index, never in a snippet. */
const SECRET_ROUTE = /^\/s\//;

export const securityHeaders = createMiddleware(async (c, next) => {
  await next();

  c.header("Content-Security-Policy", POLICY);
  // The path of /s/:id is a secret's address even though the fragment never
  // travels, so no outbound click may carry it.
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");

  if (SECRET_ROUTE.test(new URL(c.req.url).pathname)) {
    c.header("X-Robots-Tag", "noindex, nofollow");
  }
});

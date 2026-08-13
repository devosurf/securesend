import type { Context } from "hono";

/** A scheme a forwarding proxy is allowed to claim. */
const HTTP = /^https?$/;

/**
 * What this instance is being called, from the request that arrived.
 *
 * The proxy in front terminates TLS, so the connection to this process is plain
 * http and the scheme has to come from the hop that knows. Only http and https
 * are taken from that header: a header is a stranger's writing, and what this
 * returns ends up inside a document attribute, a redirect and a button somebody
 * presses.
 *
 * It is asked three times for the same reason each time. A self-hoster is not us,
 * so nothing that names this instance may be baked in at build time: not the share
 * card's image, not the url the Slack reply's button opens, and not the address
 * Slack is told to send an install back to. Each of those would otherwise carry
 * securesend.dev into somebody else's deployment.
 */
export function originOf(c: Context): string {
  const { host, protocol } = new URL(c.req.url);
  const forwarded = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const scheme =
    forwarded && HTTP.test(forwarded) ? forwarded : protocol.slice(0, -1);

  return `${scheme}://${host}`;
}

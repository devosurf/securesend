import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { env } from "../env";

/*
 * Whether a request actually came from Slack.
 *
 * There is no session with Slack and no token to look up. What proves a request
 * is theirs is a signature over the exact bytes they sent, keyed with the
 * signing secret an operator copied out of their own app's dashboard. So this is
 * the whole trust boundary for both Slack routes, and it runs before anything
 * else has read the body.
 *
 * The basestring is `v0:{timestamp}:{raw body}`, which is why a route reads text
 * rather than a parsed form: re-encoding a form and signing that would verify
 * our spelling of the request rather than Slack's.
 *
 * The timestamp is held to five minutes either side of now. Behind bounds how
 * long a captured request stays worth replaying, and ahead is bounded too,
 * because a timestamp far in front of us is no more credible than one far
 * behind it.
 *
 * An instance with no signing secret refuses everything. A self-hoster who never
 * set one has no Slack app, so there is nobody a Slack route could be answering
 * and no reason to trust a caller claiming otherwise.
 */

const VERSION = "v0";

/** How far from now a timestamp may be, in seconds, in either direction. */
const WINDOW_SECONDS = 300;

const MS_PER_SECOND = 1000;

export interface SlackRequest {
  /** The raw body, exactly as it arrived and before anything parsed it. */
  body: string;
  /** Injectable, so a replay test can stand outside the window without waiting. */
  now?: number;
  signature: string | undefined;
  signingSecret: string;
  timestamp: string | undefined;
}

export function verifySlackRequest({
  body,
  now = Date.now(),
  signature,
  signingSecret,
  timestamp,
}: SlackRequest): boolean {
  if (!(signature && timestamp)) {
    return false;
  }

  const sentAt = Number(timestamp);
  if (
    !Number.isFinite(sentAt) ||
    Math.abs(now / MS_PER_SECOND - sentAt) > WINDOW_SECONDS
  ) {
    return false;
  }

  /* The timestamp goes into the basestring as it arrived rather than as the
   * number above, because the signature is over what was sent. */
  const digest = createHmac("sha256", signingSecret)
    .update(`${VERSION}:${timestamp}:${body}`)
    .digest("hex");

  const offered = Buffer.from(signature, "utf8");
  const ours = Buffer.from(`${VERSION}=${digest}`, "utf8");

  return offered.length === ours.length && timingSafeEqual(offered, ours);
}

/**
 * The same check both Slack routes make, off the request they were handed.
 *
 * The unset secret lives in here rather than in each route, so a route cannot
 * forget it, and it answers exactly the way a bad signature does: an instance
 * without a Slack app and an instance refusing a stranger are the same "no" to
 * whoever is asking.
 */
export function signedBySlack(c: Context, body: string): boolean {
  const { signingSecret } = env.slack;

  if (!signingSecret) {
    return false;
  }

  return verifySlackRequest({
    body,
    signature: c.req.header("x-slack-signature"),
    signingSecret,
    timestamp: c.req.header("x-slack-request-timestamp"),
  });
}

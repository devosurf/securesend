import { base64urlToBytes } from "@securesend/crypto/base64url";

/*
 * What the slash command handed this browser, read back out of the address bar.
 *
 * `/new#slack=<base64url of utf-8 json>`. It rides the fragment rather than a
 * query parameter, so the channel, the sender's name and the one-time reply
 * handle stay out of every server log, ours included. Nothing here is a secret,
 * and it still does not belong in a log: a reply handle is authority to post as
 * the app into somebody's channel.
 *
 * The encoder is the api's, in `apps/api/src/slack/payload.ts`, and this decoder
 * is deliberately its own, on the precedent commented in
 * `apps/api/src/secrets/create.ts`: this is a wire format, and importing across
 * the api and web boundary drags browser types into a Node build. The two are
 * held together by the fixture string both round-trip tests read.
 *
 * This reads a stranger's writing. The address bar is the one input anybody can
 * fill in, so anything that is not the shape below is no context at all, and
 * `/new` is then the ordinary create surface. Nothing here throws and nothing
 * here quotes what it was given.
 */

const PREFIX = "slack=";

/**
 * The one origin a reply handle may be on.
 *
 * The handle decides where this browser posts the finished link, and the finished
 * link is the key. Without this check, a crafted `/new#slack=…` would be a create
 * surface that posts a sender's secret to whatever address the person who wrote
 * the link named. The content security policy refuses that request as well, and
 * this is the same rule stated where the value is read: a policy regression must
 * not be the only thing between a sender and that. The api's own decoder makes
 * the same check, or the pair of them is decorative.
 */
const HOOKS_ORIGIN = "https://hooks.slack.com";

const utf8 = new TextDecoder("utf-8", { fatal: true });

export interface SlackContext {
  channelId: string;
  /** Without its leading hash, the way the button and the receipt say it. */
  channelName: string;
  /** Epoch ms, stamped by our own command route: Slack's payload carries none. */
  issuedAt: number;
  responseUrl: string;
  /** A display name, for the channel post and nothing else. */
  senderName: string;
  teamId: string;
}

function named(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** Slack's own, and asked as an origin rather than as a prefix on a string. */
function fromSlack(responseUrl: string): boolean {
  try {
    return new URL(responseUrl).origin === HOOKS_ORIGIN;
  } catch {
    return false;
  }
}

function isContext(value: unknown): value is SlackContext {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { channelId, channelName, issuedAt, responseUrl, senderName, teamId } =
    value as Record<string, unknown>;

  return (
    named(channelId) &&
    named(channelName) &&
    typeof issuedAt === "number" &&
    Number.isFinite(issuedAt) &&
    named(responseUrl) &&
    fromSlack(responseUrl) &&
    named(senderName) &&
    named(teamId)
  );
}

/**
 * The payload, out of the fragment as an address bar spells it.
 *
 * The hash and the `slack=` in front of it are both optional, because the same
 * payload is handled in two shapes: `#slack=<payload>` is what a browser is
 * handed, and the payload on its own is what the api encodes and what both sides
 * pin their round-trip test to.
 */
function payloadOf(fragment: string): string {
  const written = fragment.startsWith("#") ? fragment.slice(1) : fragment;

  return written.startsWith(PREFIX) ? written.slice(PREFIX.length) : written;
}

export function readSlackContext(fragment: string): SlackContext | null {
  let read: unknown;
  try {
    read = JSON.parse(utf8.decode(base64urlToBytes(payloadOf(fragment))));
  } catch {
    // Not base64url, not utf-8, or not json. All the same answer: no context.
    return null;
  }

  return isContext(read) ? read : null;
}

/**
 * This tab's own fragment, asked once by the route that arrives with one.
 *
 * The one line in the browser's side of Slack that touches the address bar, kept
 * apart from the decoder so the decoder stays a function over a string.
 */
export function slackContextHere(): SlackContext | null {
  return readSlackContext(window.location.hash);
}

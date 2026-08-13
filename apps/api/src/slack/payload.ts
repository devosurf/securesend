import { z } from "zod";

/*
 * What a sender carries from Slack into the browser.
 *
 * It rides the url fragment, never a query parameter, so it stays out of every
 * server log on the way: this instance's, the proxy's, and anybody's in between.
 * The browser needs it because the finished link is posted to Slack by that
 * browser rather than by us, which is what keeps the key out of our reach on
 * this path.
 *
 * `issuedAt` is ours rather than Slack's. A slash command payload carries no
 * issue time, and the browser has to know whether the reply handle has gone
 * stale, so the command route stamps it when it answers.
 *
 * The decoder is here beside the encoder as the proof that what this writes can
 * be read back. The web has its own copy over the same fixture string, spelled
 * separately on the precedent commented in secrets/create.ts: this is a wire
 * format, and importing across the api and web boundary drags browser types
 * into a Node build.
 */

export interface SlackContext {
  channelId: string;
  channelName: string;
  issuedAt: number;
  responseUrl: string;
  senderName: string;
  teamId: string;
}

/** The one host a reply handle can name. */
const SLACK_HOOKS = "https://hooks.slack.com";

/**
 * Whether this is a Slack reply handle and not somewhere else entirely.
 *
 * A decoder takes a stranger's writing, and a link anybody can hand a sender is
 * a stranger. Without this, `/new#slack=` with a url of the sender's choosing
 * would be a surface that posts a finished link, key and all, wherever that url
 * points. The policy in headers.ts refuses the same post from the other side;
 * this is the half that can say why.
 */
function isSlackHook(value: string): boolean {
  return URL.parse(value)?.origin === SLACK_HOOKS;
}

/**
 * Anything that is not this shape is no context at all, and `/new` then behaves
 * exactly like the ordinary create surface. Strict, because every key here is
 * one this product wrote: a payload carrying more than these was not ours.
 *
 * The two names are display only and are whatever the workspace calls them, so
 * they are held to being strings and nothing more.
 */
const slackContext = z.strictObject({
  channelId: z.string().min(1),
  channelName: z.string(),
  issuedAt: z.number().int().positive(),
  responseUrl: z.url().refine(isSlackHook, "not a slack reply handle"),
  senderName: z.string(),
  teamId: z.string().min(1),
});

export function encodeSlackContext(context: SlackContext): string {
  return Buffer.from(JSON.stringify(context), "utf8").toString("base64url");
}

/**
 * Whatever json is in there, or null. Decoding base64url refuses nothing, so
 * this is where garbage and a truncated payload both stop.
 */
function jsonIn(raw: string): unknown {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function decodeSlackContext(raw: string): SlackContext | null {
  const read = slackContext.safeParse(jsonIn(raw));

  return read.success ? read.data : null;
}

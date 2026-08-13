import { Hono } from "hono";
import { originOf } from "../origin";
import { encodeSlackContext } from "./payload";
import { signedBySlack } from "./verify";

/*
 * `/ss`, and the private reply that answers it.
 *
 * The reply is a door rather than a form, because Slack has no way to open a
 * browser without a press: a slash command may answer with messages or with a
 * modal inside Slack, and nothing in the platform launches anything else. So the
 * ephemeral message carries a Block Kit url button, which opens the browser
 * straight from Slack with no second round trip through us to be handed a
 * destination.
 *
 * Whatever was typed after the command is dropped on arrival. This route asks
 * one question about it, whether there was any, and that decides which of two
 * replies goes back. It is never logged, never stored and never echoed, on any
 * path including a refusal: repeating it would put the secret on screen a second
 * time to explain that we did not keep it.
 *
 * Nothing here touches the database, so the three seconds Slack allows are not
 * in question.
 */

const UNAUTHORIZED = 401;
const BAD_REQUEST = 400;

/*
 * The copy, from the frames on the design canvas. It may not drift without those
 * moving first, so it sits up here where a reviewer reads it in one place rather
 * than inside the blocks that carry it.
 */
const CLEAN =
  "Type it in a SecureSend window, never here. The finished link posts back to this channel.";
const NOTHING_STORED =
  "Nothing was stored, and slash commands aren't posted, so nobody in the channel saw that.";
const NEVER_THROUGH_SLACK =
  "Secrets never travel through Slack. Type it in the SecureSend window and only the finished link comes back here.";
const CREATE = "Create a secret";

/**
 * One ephemeral reply: what it says, and the one press it offers.
 *
 * Ephemeral rather than in channel because nobody else in the room asked for
 * this, and the command they would be reading a reply to was never posted.
 */
function reply(said: readonly [string, ...string[]], url: string) {
  const [lead, ...rest] = said;

  return {
    blocks: [
      { text: { text: lead, type: "mrkdwn" }, type: "section" },
      ...rest.map((line) => ({
        elements: [{ text: line, type: "mrkdwn" }],
        type: "context",
      })),
      {
        elements: [
          {
            style: "primary",
            text: { text: CREATE, type: "plain_text" },
            type: "button",
            url,
          },
        ],
        type: "actions",
      },
    ],
    response_type: "ephemeral",
  };
}

export const command = new Hono().post("/command", async (c) => {
  /* Text, and before anything parses it. The signature is over the exact bytes
   * that arrived, so a form re-encoded from a parsed body would be a different
   * request by the time it was checked. */
  const body = await c.req.text();

  if (!signedBySlack(c, body)) {
    return c.json({ error: "that request is not from Slack" }, UNAUTHORIZED);
  }

  const form = new URLSearchParams(body);
  const channelId = form.get("channel_id");
  const channelName = form.get("channel_name");
  const responseUrl = form.get("response_url");
  const teamId = form.get("team_id");

  // A signed request that is not a slash command payload. Nothing a caller can
  // do about it, and nothing they are owed beyond being told it was refused.
  if (!(channelId && channelName && responseUrl && teamId)) {
    return c.json({ error: "that is not a slash command" }, BAD_REQUEST);
  }

  const context = encodeSlackContext({
    channelId,
    channelName,
    // Slack's payload carries no issue time and the browser has to know whether
    // the reply handle has gone stale, so it is stamped here.
    issuedAt: Date.now(),
    responseUrl,
    senderName: form.get("user_name") ?? "",
    teamId,
  });

  const url = `${originOf(c)}/new#slack=${context}`;

  /* The only question this route asks about what was typed, and it keeps none of
   * the answer. Nothing below can reach the text again. */
  const carriedText = (form.get("text") ?? "").trim() !== "";

  return c.json(
    carriedText
      ? reply([NOTHING_STORED, NEVER_THROUGH_SLACK], url)
      : reply([CLEAN], url)
  );
});

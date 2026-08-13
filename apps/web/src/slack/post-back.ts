import type { Expiry } from "../compose/seal-and-send";
import type { SlackContext } from "./payload";

/*
 * The two messages this browser puts in the channel, and why it is this browser
 * that puts them there.
 *
 * The finished link carries the key after its hash. If our own instance posted
 * it, our own instance would have held it, and the one claim the product makes
 * would be over. So the sender's browser posts to the one-time reply handle the
 * command left in the fragment, and the key exists in exactly two places: this
 * tab, and the channel the sender chose.
 *
 * There are two messages rather than one because Slack echoes the whole source
 * message back to the app when a button in it is pressed. A button on the message
 * carrying the link would hand us the key on the first press. So:
 *
 *   the channel post  carries the link, carries no buttons, and is never edited
 *   the controls      carry the buttons, carry no link, and only the sender sees
 *                     them. Their values hold an id and a management token, which
 *                     is authority over the secret's life and decrypts nothing
 *
 * The cost is visible and deliberate: burn the secret and the post above still
 * says how long it had left, because editing it would mean sending the key again.
 *
 * Nothing in this file may be logged. Every value that passes through it is
 * either the link, which is the key, or the token that can destroy the secret.
 */

/**
 * How long a reply handle is worth using.
 *
 * Slack gives a slash command's handle 30 minutes, and `issuedAt` is our own
 * stamp because Slack's payload carries no issue time. Past the window nothing is
 * posted at all: a sender who left the tab open over lunch gets the ordinary
 * copy-the-link receipt rather than a channel post that quietly never happened.
 */
const MINUTE_MS = 60_000;
export const POST_WINDOW_MS = 30 * MINUTE_MS;

/** The same phrases the picker and the receipt use, keyed by what the api takes. */
const SPOKEN: Record<Expiry, string> = {
  "1h": "1 hour",
  "24h": "24 hours",
  "72h": "72 hours",
};

/**
 * What extending offers, which is not what creating offers.
 *
 * The picker's three values are the choice a sender makes once. These are what is
 * left afterwards, and an extension is only an extension if it is longer than what
 * the secret already has, so a 72 hour secret is offered neither.
 */
const EXTENSIONS = [
  { hours: 48, said: "48 hours", verb: "extend48" },
  { hours: 72, said: "72 hours", verb: "extend72" },
] as const;

const HOURS: Record<Expiry, number> = { "1h": 1, "24h": 24, "72h": 72 };

/** `&`, `<` and `>`, which are the three characters Slack's mrkdwn reads as markup. */
const MARKUP = /[&<>]/g;
const ESCAPED: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

/**
 * A name from somebody else's workspace, as text rather than as markup.
 *
 * It arrives in the fragment, which is the one input a stranger can write, and an
 * unescaped `<https://…|press here>` in a display name would forge a second link
 * in a message whose whole point is that it carries exactly one.
 */
function plain(text: string): string {
  return text.replaceAll(
    MARKUP,
    (character) => ESCAPED[character] ?? character
  );
}

/** Whether the handle the command left is still worth posting to. */
export function worthPosting(context: SlackContext, now = Date.now()): boolean {
  return now - context.issuedAt <= POST_WINDOW_MS;
}

/*
 * The message everybody in the channel sees. No buttons, now or ever.
 *
 * `unfurl_links` is off because an unfurl is Slack fetching the link to draw a
 * preview of it, and this link opens once. The fallback text is the line a phone
 * shows on a lock screen, so it says what happened and leaves the link to the body.
 *
 * The link is written out whole rather than shortened behind a label. A shortened
 * label reads better and costs the one thing this product cannot lose: the key is
 * in the link, so a reader who copies the line instead of pressing it would carry
 * away an address that opens nothing. Slack renders a bare url as a link anyway,
 * so pressing it still works and copying it now does too.
 */
function linkMessage(context: SlackContext, link: string, expiry: Expiry) {
  const said = `${plain(context.senderName)} shared a one-time secret`;

  return {
    blocks: [
      {
        text: { text: `${said}\n${link}`, type: "mrkdwn" },
        type: "section",
      },
      {
        elements: [
          { text: `expires in ${SPOKEN[expiry]} · one view`, type: "mrkdwn" },
        ],
        type: "context",
      },
    ],
    replace_original: false,
    response_type: "in_channel",
    text: said,
    unfurl_links: false,
  };
}

/*
 * The sender's own controls, which nobody else in the channel can see.
 *
 * Every button carries the id and the management token, because that token is the
 * one authority over a secret's life anywhere in this product: the interactions
 * route checks it exactly as the burn route does, so there is no second way to
 * kill a secret that the token does not govern.
 */
function controlsMessage(id: string, managementToken: string, expiry: Expiry) {
  const button = (said: string, verb: string) => ({
    action_id: verb,
    text: { emoji: false, text: said, type: "plain_text" },
    type: "button",
    value: JSON.stringify({ do: verb, id, managementToken }),
  });

  const offered = EXTENSIONS.filter(({ hours }) => hours > HOURS[expiry]);

  return {
    blocks: [
      {
        text: { text: `expires in ${SPOKEN[expiry]}`, type: "mrkdwn" },
        type: "section",
      },
      {
        elements: [
          ...offered.map(({ said, verb }) => button(said, verb)),
          button("burn now", "burn"),
        ],
        type: "actions",
      },
    ],
    replace_original: false,
    response_type: "ephemeral",
    text: `expires in ${SPOKEN[expiry]}`,
  };
}

/*
 * Delivery, shaped by what a browser is allowed to send to another origin without
 * asking it first.
 *
 * `fetch` in cors mode with `Content-Type: application/json`, the encoding Slack
 * documents, is refused at the preflight: the handle answers no preflight. What
 * gets through is a CORS simple request, so the message rides as form-encoded
 * `payload=<json>`.
 *
 * `fetch` carries it, with `keepalive` so a tab closing on the receipt does not
 * cancel the post. A beacon has that same property and was tried here first, which
 * was a mistake worth writing down: `sendBeacon` reports whether the browser
 * queued the request, not whether it left, so a beacon a privacy setting drops
 * still answers true and the caller learns nothing. It stays only as the fallback
 * for a browser that refuses the fetch outright.
 *
 * The answer is opaque either way. This browser cannot know whether Slack took the
 * message, only whether it managed to send one.
 */
function deliver(responseUrl: string, message: object): void {
  const body = new URLSearchParams({ payload: JSON.stringify(message) });

  fetch(responseUrl, {
    body,
    keepalive: true,
    method: "POST",
    mode: "no-cors",
  }).catch(() => {
    /* Nothing is logged on the way past. The body is the secret's own link, so an
     * error carrying the request would carry the key into a console. */
    navigator.sendBeacon?.(responseUrl, body);
  });
}

export function postToChannel(input: {
  context: SlackContext;
  expiry: Expiry;
  id: string;
  link: string;
  managementToken: string;
  now?: number;
}): void {
  const {
    context,
    expiry,
    id,
    link,
    managementToken,
    now = Date.now(),
  } = input;

  if (!worthPosting(context, now)) {
    return;
  }

  deliver(context.responseUrl, linkMessage(context, link, expiry));
  deliver(context.responseUrl, controlsMessage(id, managementToken, expiry));
}

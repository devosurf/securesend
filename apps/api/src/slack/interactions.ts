import { isSecretId } from "@securesend/crypto/ids";
import { Hono } from "hono";
import { z } from "zod";
import { burnSecret } from "../secrets/burn";
import { type ExtendTarget, extendSecret } from "../secrets/extend";
import { MANAGEMENT_TOKEN_LENGTH } from "../secrets/management";
import type { SecretState, SecretStatus } from "../secrets/state";
import { signedBySlack } from "./verify";

/*
 * The three buttons on the sender's own controls message: extend to 48 hours,
 * extend to 72 hours, burn now.
 *
 * ---- what a button is allowed to carry --------------------------------------
 *
 * Slack echoes the whole source message back when a button in it is pressed, which
 * is why there are two messages in a channel rather than one: the post carries the
 * link and no buttons, and this message carries the buttons and no link. So nothing
 * that arrives here can be key material, and the schema below is what holds that
 * open to inspection. It is strict and it names three fields, so a value carrying a
 * fourth, or an id that is a whole link with a fragment on it, is refused rather
 * than parsed.
 *
 * A button's value is `{ do, id, managementToken }`. The ticket said the id alone,
 * and the id alone would have made this route a second way to kill a secret that
 * the management token does not govern. The token is not key material, it decrypts
 * nothing, and the message it rides in is visible only to the sender who made the
 * secret, so carrying it keeps the product at exactly one authority model.
 *
 * ---- how it answers ---------------------------------------------------------
 *
 * With the replacement message in the HTTP response and `replace_original`, rather
 * than by posting the replacement to the interaction's `response_url`. This is a
 * deliberate deviation from the ticket. The route has to answer inside three
 * seconds either way and by then it already holds the new state, so a second
 * outbound call from a single-process app is one more thing that can fail and buys
 * nothing at all.
 *
 * An affordance that has been spent does not come back: 48 disappears once the
 * clock is at or past 48, and a secret that is no longer sealed carries no buttons
 * at all. The channel post is never edited, because editing it would mean sending
 * the key back through Slack, so this message is where the truth about a secret
 * lives after it is posted.
 */

const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;

const AN_HOUR_MS = 60 * 60 * 1000;

/*
 * The copy, from slack--posted on the design canvas. Two of these lines are not on
 * the canvas because a frame cannot be pressed by a stale button: `used` and
 * `expired` take the burned line's grammar and its own word for what happened, and
 * `NOT_YOURS` is the one answer a press gets when the token does not manage
 * anything at that id, which is also the answer when there is nothing at that id.
 */
const SPENT = "the link above now opens to nothing";
const NOT_YOURS = "nothing here manages that secret";
const BURN_NOW = "burn now";

/**
 * What the sentence says once a secret is past acting on. `used` and never
 * `opened`: the instance watched a press and ciphertext go out, and whether the
 * browser on the other end could read it never left that tab.
 */
const GONE: Record<Exclude<SecretState, "sealed">, string> = {
  burned: `burned · ${SPENT}`,
  expired: `expired · ${SPENT}`,
  used: `used · ${SPENT}`,
};

/** What Slack offers, which is not what the create surface offers. */
const TARGETS: readonly ExtendTarget[] = [48, 72];

type Intent = "extend48" | "extend72" | "burn";

/**
 * The interaction, held to the one kind this app registers for. Loose about
 * everything else in it, because Slack sends far more than this and none of the
 * rest is read.
 */
const interaction = z.object({
  actions: z.array(z.object({ value: z.string().optional() })).min(1),
  type: z.literal("block_actions"),
});

/**
 * One press, and the whole of what a button may say.
 *
 * Strict, and every field measured: the id is one this product generates, the token
 * is the length a management token is, and the intent is one of three words. There
 * is no field here a key could ride in and no field a longer string could ride in
 * either.
 */
const pressed = z.strictObject({
  do: z.enum(["extend48", "extend72", "burn"]),
  id: z.string().refine(isSecretId, "not an id this product generates"),
  managementToken: z.string().length(MANAGEMENT_TOKEN_LENGTH),
});

/** Whatever json is in there, or null, because both of these are strangers' writing. */
function jsonIn(raw: string | null): unknown {
  if (raw === null) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** How long this secret was given, which is the sentence the sender reads. */
function hoursOf(status: SecretStatus): number {
  return Math.round(
    (Date.parse(status.expiresAt) - Date.parse(status.createdAt)) / AN_HOUR_MS
  );
}

function spoken(hours: number): string {
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/**
 * One button. No colour on any of the three, the destroy included: teal belongs to
 * the reversible choice everywhere else in this product and there is no red here to
 * reach for.
 *
 * The value is written out field by field rather than spread from the press that
 * arrived, so what a button carries is decided in this line and nowhere else.
 */
function button(label: string, intent: Intent, press: z.infer<typeof pressed>) {
  return {
    action_id: intent,
    text: { text: label, type: "plain_text" },
    type: "button",
    value: JSON.stringify({
      do: intent,
      id: press.id,
      managementToken: press.managementToken,
    }),
  };
}

/**
 * What is still worth offering. An extension shorter than the clock already set is
 * not an extension, so it is gone from the row rather than sitting there refusing,
 * and a secret that is no longer sealed offers nothing.
 */
function offered(status: SecretStatus, press: z.infer<typeof pressed>) {
  if (status.state !== "sealed") {
    return [];
  }

  const set = hoursOf(status);

  return [
    ...TARGETS.filter((target) => target > set).map((target) =>
      button(spoken(target), `extend${target}`, press)
    ),
    button(BURN_NOW, "burn", press),
  ];
}

/** The controls message, standing in for the one the button was pressed on. */
function replacement(said: string, elements: ReturnType<typeof button>[]) {
  return {
    blocks: [
      { text: { text: said, type: "mrkdwn" }, type: "section" },
      ...(elements.length > 0 ? [{ elements, type: "actions" }] : []),
    ],
    replace_original: true,
    response_type: "ephemeral",
  };
}

function controls(status: SecretStatus | null, press: z.infer<typeof pressed>) {
  if (!status) {
    return replacement(NOT_YOURS, []);
  }

  const said =
    status.state === "sealed"
      ? `expires in ${spoken(hoursOf(status))}`
      : GONE[status.state];

  return replacement(said, offered(status, press));
}

async function actOn(
  press: z.infer<typeof pressed>
): Promise<SecretStatus | null> {
  const { do: intent, id, managementToken } = press;

  if (intent === "burn") {
    /* Both refusals become one answer here, and that is the point. Whoever Slack
     * will sign for can press this, so telling a wrong token apart from an absent
     * id would turn a button into a way to learn which secrets exist. The browser's
     * own burn route does tell them apart, because it already holds the token that
     * proves which secret it means. */
    const outcome = await burnSecret({ id, managementToken });

    return outcome.kind === "burned" || outcome.kind === "gone"
      ? outcome.status
      : null;
  }

  return extendSecret({
    id,
    managementToken,
    target: intent === "extend48" ? 48 : 72,
  });
}

export const interactions = new Hono().post("/interactions", async (c) => {
  /* Text, and before anything parses it: the signature is over the exact bytes
   * that arrived, so a form re-encoded from a parsed body is a different request
   * by the time it is checked. */
  const body = await c.req.text();

  if (!signedBySlack(c, body)) {
    return c.json({ error: "that request is not from Slack" }, UNAUTHORIZED);
  }

  const form = new URLSearchParams(body);
  const read = interaction.safeParse(jsonIn(form.get("payload")));

  if (!read.success) {
    return c.body(null, BAD_REQUEST);
  }

  /* The url button on the command reply is a block action too, and Slack fires one
   * every time somebody presses it. There is no value on it because it opens a
   * browser rather than asking us anything, so this is an acknowledgement and
   * nothing else. */
  const value = read.data.actions[0]?.value;
  if (value === undefined) {
    return c.body(null, OK);
  }

  const press = pressed.safeParse(jsonIn(value));
  if (!press.success) {
    return c.body(null, BAD_REQUEST);
  }

  return c.json(controls(await actOn(press.data), press.data));
});

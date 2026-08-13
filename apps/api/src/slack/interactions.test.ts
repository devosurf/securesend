import { createHmac } from "node:crypto";
import { newSecretId } from "@securesend/crypto/ids";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { closeDatabase } from "../db/client";
import { env } from "../env";
import { mintManagementToken } from "../secrets/management";
import { attachmentRowsOf, countToday, rowOf, seal } from "../secrets/testing";

afterAll(closeDatabase);

/*
 * The buttons on the sender's controls message.
 *
 * Two things are being held here beyond the presses working. That the whole of a
 * sender's authority is still the management token, so a press that does not carry
 * the right one changes nothing and learns nothing about whether the id exists. And
 * that a button may carry three fields and no fourth, which is what keeps this
 * route from being a place key material could arrive.
 *
 * The instance's signing secret is set here rather than read from the environment,
 * the way the command tests set it: both branches have to be drivable whether or
 * not whoever runs this has a Slack app, and one of the branches is having no
 * secret at all.
 */

const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;

const A_SECOND = 1000;

const SIGNING_SECRET = "8f742231b10e8888abcd99yyyzzz85a5";

/** A key, which is the one thing that may never reach this route. */
const A_KEY = "AQGf7T2mKq9vRs4WxYz1bCd3EhJk5LnPqUt8VwZa2Bc4De";

const NOT_YOURS = "nothing here manages that secret";
const BURNED = "burned · the link above now opens to nothing";

const configured = env.slack.signingSecret;

beforeEach(() => {
  env.slack.signingSecret = SIGNING_SECRET;
});

afterAll(() => {
  env.slack.signingSecret = configured;
});

/** Slack's own headers, spelled the way Slack's documentation spells them. */
function slackHeaders(body: string, at = Date.now()) {
  const timestamp = String(Math.floor(at / A_SECOND));
  const digest = createHmac("sha256", SIGNING_SECRET)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex");

  return {
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": `v0=${digest}`,
  };
}

function post(body: string, headers: Record<string, string>) {
  return app.request("/api/slack/interactions", {
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    method: "POST",
  });
}

/**
 * One interaction, form-encoded with the json in a `payload` field the way Slack
 * posts it. The response url is here because Slack sends one and this route
 * deliberately never uses it.
 */
function formOf(payload: Record<string, unknown>): string {
  return new URLSearchParams({
    payload: JSON.stringify({
      api_app_id: "A0001",
      channel: { id: "C024BE91L", name: "eng-infra" },
      response_url: "https://hooks.slack.com/actions/T0001/1234/abcd",
      team: { domain: "northwind", id: "T0001" },
      trigger_id: "13345224609.738474920.8088930838d88f008e0",
      type: "block_actions",
      user: { id: "U0001", name: "Marta Ek" },
      ...payload,
    }),
  }).toString();
}

/** One signed press of a button carrying `value`, or of one carrying none. */
function press(value: unknown) {
  const body = formOf({
    actions: [
      {
        action_id: "burn",
        type: "button",
        ...(value === undefined ? {} : { value: JSON.stringify(value) }),
      },
    ],
  });

  return post(body, slackHeaders(body));
}

/** The three fields a button is allowed to carry, and the press that carries them. */
function pressing(
  secret: { id: string; managementToken: string },
  intent: string
) {
  return {
    do: intent,
    id: secret.id,
    managementToken: secret.managementToken,
  };
}

interface Reply {
  blocks: readonly {
    elements?: readonly {
      action_id?: string;
      text?: { text: string };
      value?: string;
    }[];
    text?: { text: string };
    type: string;
  }[];
  replace_original: boolean;
  response_type: string;
}

/** The reply to one signed press, or a loud failure if the route refused it. */
async function replyTo(value: unknown): Promise<Reply> {
  const response = await press(value);

  if (response.status !== OK) {
    throw new Error(`the route refused a signed press: ${response.status}`);
  }

  return (await response.json()) as Reply;
}

function said(reply: Reply): string {
  return (
    reply.blocks.find((block) => block.type === "section")?.text?.text ?? ""
  );
}

function buttons(reply: Reply) {
  return reply.blocks.flatMap((block) =>
    block.type === "actions" ? [...(block.elements ?? [])] : []
  );
}

describe("POST /api/slack/interactions", () => {
  it("burns a sealed secret and takes its files with it", async () => {
    const sealed = await seal("24h", 2);

    const reply = await replyTo(pressing(sealed, "burn"));

    expect(said(reply)).toBe(BURNED);
    expect(reply.replace_original).toBe(true);
    expect(reply.response_type).toBe("ephemeral");

    const row = await rowOf(sealed.id);
    expect(row.burnedAt).not.toBeNull();
    expect(row.burnReason).toBe("sender");
    expect(row.envelope).toBeNull();
    expect(await attachmentRowsOf(sealed.id)).toStrictEqual([]);
  });

  /* Nothing about a burned secret is still worth pressing, and the channel post
   * above it cannot be edited, so this message is the only thing telling the truth
   * about it afterwards. */
  it("offers nothing at all once the secret is burned", async () => {
    const sealed = await seal();

    const reply = await replyTo(pressing(sealed, "burn"));

    expect(buttons(reply)).toStrictEqual([]);
  });

  it("says the same thing the second time it is pressed", async () => {
    const sealed = await seal();

    const first = await replyTo(pressing(sealed, "burn"));
    const again = await replyTo(pressing(sealed, "burn"));

    expect(again).toStrictEqual(first);
  });

  it("counts one burn however many times it is pressed", async () => {
    const sealed = await seal();
    const before = await countToday("burns");

    await press(pressing(sealed, "burn"));
    await press(pressing(sealed, "burn"));

    expect(await countToday("burns")).toBe(before + 1);
  });

  it("never lets an answer be cached", async () => {
    const sealed = await seal();

    const response = await press(pressing(sealed, "burn"));

    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  /* Slack fires a block action when the command reply's url button is pressed, and
   * that action carries no value because it opens a browser rather than asking us
   * anything. */
  it("acknowledges the command reply's own button and changes nothing", async () => {
    const sealed = await seal();
    const was = await rowOf(sealed.id);

    const response = await press(undefined);

    expect(response.status).toBe(OK);
    expect(await response.text()).toBe("");

    const row = await rowOf(sealed.id);
    expect(row.burnedAt).toBeNull();
    expect(row.expiresAt).toStrictEqual(was.expiresAt);
  });

  it("refuses an interaction of a kind it does not handle", async () => {
    const body = formOf({ type: "view_submission" });

    const response = await post(body, slackHeaders(body));

    expect(response.status).toBe(BAD_REQUEST);
  });
});

describe("POST /api/slack/interactions, and the authority a press carries", () => {
  it("refuses a token that does not manage this secret, and burns nothing", async () => {
    const sealed = await seal();

    const reply = await replyTo({
      do: "burn",
      id: sealed.id,
      managementToken: mintManagementToken(),
    });

    expect(said(reply)).toBe(NOT_YOURS);
    expect(buttons(reply)).toStrictEqual([]);

    const row = await rowOf(sealed.id);
    expect(row.burnedAt).toBeNull();
    expect(row.envelope).not.toBeNull();
  });

  it("refuses another secret's token", async () => {
    const [mine, yours] = await Promise.all([seal(), seal()]);

    const reply = await replyTo({
      do: "burn",
      id: mine.id,
      managementToken: yours.managementToken,
    });

    expect(said(reply)).toBe(NOT_YOURS);
    expect((await rowOf(mine.id)).burnedAt).toBeNull();
  });

  /* The refusal may not be a way to ask which ids exist, so a real secret with the
   * wrong token and an id that was never stored answer identically. */
  it("says nothing about whether the id exists", async () => {
    const sealed = await seal();
    const token = mintManagementToken();

    const [wrongToken, noSuchSecret] = await Promise.all([
      replyTo({ do: "burn", id: sealed.id, managementToken: token }),
      replyTo({ do: "burn", id: newSecretId(), managementToken: token }),
    ]);

    expect(wrongToken).toStrictEqual(noSuchSecret);
  });
});

/*
 * The id-only invariant, from the other direction.
 *
 * The two messages are separate precisely so that what Slack echoes back to us
 * cannot be key material. These hold that open: a value may carry three named
 * fields, each measured, and anything else is refused before it is acted on.
 */
describe("POST /api/slack/interactions, and what a button may carry", () => {
  it("hands back buttons carrying nothing but the three fields", async () => {
    const sealed = await seal();

    const reply = await replyTo(pressing(sealed, "extend48"));
    const carried = buttons(reply).map(
      (element) => JSON.parse(element.value ?? "{}") as Record<string, unknown>
    );

    expect(carried).not.toStrictEqual([]);
    for (const value of carried) {
      expect(Object.keys(value).toSorted()).toStrictEqual([
        "do",
        "id",
        "managementToken",
      ]);
    }
  });

  it("refuses a value carrying a field beyond the three", async () => {
    const sealed = await seal();

    const response = await press({
      ...pressing(sealed, "burn"),
      key: A_KEY,
    });

    expect(response.status).toBe(BAD_REQUEST);
    expect(await response.text()).not.toContain(A_KEY);
    expect((await rowOf(sealed.id)).burnedAt).toBeNull();
  });

  it("refuses an id that is a whole link with a key on it", async () => {
    const sealed = await seal();

    const response = await press({
      do: "burn",
      id: `${sealed.id}#${A_KEY}`,
      managementToken: sealed.managementToken,
    });

    expect(response.status).toBe(BAD_REQUEST);
    expect((await rowOf(sealed.id)).burnedAt).toBeNull();
  });

  it("refuses a value that is not a press this route offers", async () => {
    const sealed = await seal();

    const refused = await Promise.all([
      press({ do: "burn", id: sealed.id }),
      press(pressing(sealed, "extend96")),
      press({ ...pressing(sealed, "burn"), managementToken: A_KEY }),
      press("not json at all"),
    ]);

    expect(refused.map((response) => response.status)).toStrictEqual(
      refused.map(() => BAD_REQUEST)
    );
    expect((await rowOf(sealed.id)).burnedAt).toBeNull();
  });
});

describe("POST /api/slack/interactions, refused", () => {
  it("refuses a request nobody signed", async () => {
    const sealed = await seal();

    const response = await post(
      formOf({
        actions: [{ value: JSON.stringify(pressing(sealed, "burn")) }],
      }),
      {}
    );

    expect(response.status).toBe(UNAUTHORIZED);
    expect((await rowOf(sealed.id)).burnedAt).toBeNull();
  });

  it("refuses a signature that is not the one over these bytes", async () => {
    const sealed = await seal();
    const body = formOf({
      actions: [{ value: JSON.stringify(pressing(sealed, "burn")) }],
    });

    const refused = await Promise.all([
      post(body, { ...slackHeaders(body), "x-slack-signature": "v0=nope" }),
      post(`${body}&extra=1`, slackHeaders(body)),
      post(body, {
        "x-slack-signature": slackHeaders(body)["x-slack-signature"],
      }),
    ]);

    expect(refused.map((response) => response.status)).toStrictEqual(
      refused.map(() => UNAUTHORIZED)
    );
    expect((await rowOf(sealed.id)).burnedAt).toBeNull();
  });

  it("refuses a press signed long enough ago to be a replay", async () => {
    const A_DAY = 24 * 60 * 60 * A_SECOND;
    const sealed = await seal();

    const body = formOf({
      actions: [{ value: JSON.stringify(pressing(sealed, "burn")) }],
    });

    const response = await post(body, slackHeaders(body, Date.now() - A_DAY));

    expect(response.status).toBe(UNAUTHORIZED);
    expect((await rowOf(sealed.id)).burnedAt).toBeNull();
  });

  /* An instance whose operator never set a signing secret has no Slack app, so
   * there is nobody this route could be answering. */
  it("refuses everything while the instance has no signing secret", async () => {
    const sealed = await seal();
    env.slack.signingSecret = undefined;

    const response = await press(pressing(sealed, "burn"));

    expect(response.status).toBe(UNAUTHORIZED);
    expect(await response.json()).toStrictEqual({
      error: "that request is not from Slack",
    });
    expect((await rowOf(sealed.id)).burnedAt).toBeNull();
  });
});

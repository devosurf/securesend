import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { closeDatabase } from "../db/client";
import { env } from "../env";
import { decodeSlackContext } from "./payload";

afterAll(closeDatabase);

/*
 * `/ss`, answered.
 *
 * Two things are being held here. That a request nobody signed gets nothing at
 * all, and that whatever was typed after the command goes no further than the
 * one question this route asks about it.
 *
 * The second is the reason the argument in these tests is a word a reviewer can
 * grep for: it may not appear in the reply, in the payload the button carries,
 * or in anything the process writes, on the good path or on a refused one.
 *
 * The instance's signing secret is set here rather than read from the
 * environment. Both branches have to be drivable whether or not whoever runs
 * this has a Slack app of their own, and one of the branches is having no secret
 * at all.
 */

const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;

const A_SECOND = 1000;

const SIGNING_SECRET = "8f742231b10e8888abcd99yyyzzz85a5";
const A_SECRET = "hunter2";

const CLEAN =
  "Type it in a SecureSend window, never here. The finished link posts back to this channel.";
const NOTHING_STORED =
  "Nothing was stored, and slash commands aren't posted, so nobody in the channel saw that.";
const NEVER_THROUGH_SLACK =
  "Secrets never travel through Slack. Type it in the SecureSend window and only the finished link comes back here.";

/** The fields Slack posts for a slash command, minus the ones nobody reads. */
const COMMAND = {
  channel_id: "C024BE91L",
  channel_name: "eng-infra",
  command: "/ss",
  response_url: "https://hooks.slack.com/commands/T0001/1234/abcd",
  team_id: "T0001",
  text: "",
  user_id: "U0001",
  user_name: "Marta Ek",
};

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
  return app.request("/api/slack/command", {
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    method: "POST",
  });
}

function formOf(fields: Record<string, string>): string {
  return new URLSearchParams({ ...COMMAND, ...fields }).toString();
}

/** One signed `/ss`, with whatever the sender typed after it. */
function ask(text = "", headers: Record<string, string> = {}) {
  const body = formOf({ text });

  return post(body, { ...slackHeaders(body), ...headers });
}

interface Reply {
  blocks: readonly {
    elements?: readonly { url?: string }[];
    text?: { text: string; type: string };
    type: string;
  }[];
  response_type: string;
}

function buttonUrl(reply: Reply): string {
  const found = reply.blocks
    .flatMap((block) => block.elements ?? [])
    .find((element) => element.url !== undefined)?.url;

  if (!found) {
    throw new Error("the reply offered no door out");
  }

  return found;
}

/** What the button hands the browser, read back out of its fragment. */
function contextIn(reply: Reply) {
  const { hash, origin, pathname } = new URL(buttonUrl(reply));

  return {
    context: decodeSlackContext(hash.replace("#slack=", "")),
    origin,
    pathname,
  };
}

/** The reply to one signed `/ss`, or a loud failure if the route refused it. */
async function replyTo(text = "", headers: Record<string, string> = {}) {
  const response = await ask(text, headers);

  if (response.status !== OK) {
    throw new Error(`the route refused a signed command: ${response.status}`);
  }

  return (await response.json()) as Reply;
}

describe("POST /api/slack/command", () => {
  it("answers a bare /ss privately, with one door out", async () => {
    expect(await replyTo()).toStrictEqual({
      blocks: [
        { text: { text: CLEAN, type: "mrkdwn" }, type: "section" },
        {
          elements: [
            {
              style: "primary",
              text: { text: "Create a secret", type: "plain_text" },
              type: "button",
              url: expect.stringContaining("/new#slack="),
            },
          ],
          type: "actions",
        },
      ],
      response_type: "ephemeral",
    });
  });

  it("answers an argument with the nudge, and the same door", async () => {
    expect(await replyTo(A_SECRET)).toStrictEqual({
      blocks: [
        { text: { text: NOTHING_STORED, type: "mrkdwn" }, type: "section" },
        {
          elements: [{ text: NEVER_THROUGH_SLACK, type: "mrkdwn" }],
          type: "context",
        },
        {
          elements: [
            {
              style: "primary",
              text: { text: "Create a secret", type: "plain_text" },
              type: "button",
              url: expect.stringContaining("/new#slack="),
            },
          ],
          type: "actions",
        },
      ],
      response_type: "ephemeral",
    });
  });

  it("hands the browser the channel it was called from", async () => {
    const { context, origin, pathname } = contextIn(await replyTo());

    expect(origin).toBe("http://localhost");
    expect(pathname).toBe("/new");
    expect(context).toMatchObject({
      channelId: COMMAND.channel_id,
      channelName: COMMAND.channel_name,
      responseUrl: COMMAND.response_url,
      senderName: COMMAND.user_name,
      teamId: COMMAND.team_id,
    });
  });

  /* Slack's payload carries no issue time, so this is the stamp the browser
   * reads to know whether the reply handle is still worth posting to. */
  it("stamps the reply with the time it answered", async () => {
    const before = Date.now();

    const { context } = contextIn(await replyTo());

    expect(context?.issuedAt).toBeGreaterThanOrEqual(before);
    expect(context?.issuedAt).toBeLessThanOrEqual(Date.now());
  });

  /* A self-hoster is not us, so the door leads back to whatever this instance is
   * being called rather than to an address baked in at build time. */
  it("points the door at the instance the request arrived on", async () => {
    const reply = await replyTo("", { "x-forwarded-proto": "https" });

    expect(new URL(buttonUrl(reply)).origin).toBe("https://localhost");
  });

  it("never lets an answer be cached", async () => {
    const response = await ask();

    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

describe("POST /api/slack/command, and what the sender typed", () => {
  it("keeps the argument out of the reply and out of the payload", async () => {
    const response = await ask(A_SECRET);
    const said = await response.text();

    expect(said).not.toContain(A_SECRET);

    const { context } = contextIn(JSON.parse(said) as Reply);
    expect(JSON.stringify(context)).not.toContain(A_SECRET);
  });

  it("keeps it out of a refusal too", async () => {
    const body = formOf({ text: A_SECRET });

    const response = await post(body, {
      ...slackHeaders(body),
      "x-slack-signature": "v0=nope",
    });

    expect(response.status).toBe(UNAUTHORIZED);
    expect(await response.text()).not.toContain(A_SECRET);
  });

  /* The whole of "never logged", asserted rather than reviewed: this route is
   * the only place the argument exists at all, and nothing it does may put it
   * where an operator reads it later. */
  it("writes nothing to the log while answering", async () => {
    const wrote = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const printed = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    await ask(A_SECRET);

    expect(wrote).not.toHaveBeenCalled();
    expect(printed).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});

describe("POST /api/slack/command, refused", () => {
  it("refuses a request nobody signed", async () => {
    const response = await post(formOf({}), {});

    expect(response.status).toBe(UNAUTHORIZED);
  });

  it("refuses a signature that is not the one over these bytes", async () => {
    const body = formOf({});

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
  });

  it("refuses a request signed long enough ago to be a replay", async () => {
    const A_DAY = 24 * 60 * 60 * A_SECOND;
    const body = formOf({});

    const response = await post(body, slackHeaders(body, Date.now() - A_DAY));

    expect(response.status).toBe(UNAUTHORIZED);
  });

  /* An instance whose operator never set a signing secret has no Slack app, so
   * there is nobody this route could be answering. */
  it("refuses everything while the instance has no signing secret", async () => {
    env.slack.signingSecret = undefined;

    const response = await ask();

    expect(response.status).toBe(UNAUTHORIZED);
  });

  it("says the same thing however it was refused", async () => {
    const stranger = await (await post(formOf({}), {})).json();

    env.slack.signingSecret = undefined;
    const unconfigured = await (await ask()).json();

    expect(stranger).toStrictEqual(unconfigured);
    expect(stranger).toStrictEqual({ error: "that request is not from Slack" });
  });

  it("refuses a signed request that is not a slash command", async () => {
    const body = "hello=there";

    const response = await post(body, slackHeaders(body));

    expect(response.status).toBe(BAD_REQUEST);
  });
});

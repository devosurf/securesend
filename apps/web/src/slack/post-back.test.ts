import { afterEach, describe, expect, it } from "vitest";
import type { SlackContext } from "./payload";
import { postToChannel } from "./post-back";

/*
 * The two messages, driven at their own boundary with a fake Slack on the other
 * side.
 *
 * The rule this file exists to hold is the separation: Slack echoes a whole
 * message back to the app when a button in it is pressed, so a button on the
 * message carrying the link would hand our own server the key on the first press.
 * The link and the buttons must never be in one message, and the key must appear
 * in exactly one of the two bodies.
 *
 * There is no beacon in this runtime, so what runs here is the fetch that carries
 * the post wherever a browser has no beacon to offer.
 */

const CONTEXT: SlackContext = {
  channelId: "C05JQ7X2K1M",
  channelName: "eng-infra",
  issuedAt: 1_786_000_000_000,
  responseUrl:
    "https://hooks.slack.com/commands/T02ABCD1234/8172635401/9Xk2mQ7vLp",
  senderName: "Liam Vinberg",
  teamId: "T02ABCD1234",
};

const KEY = "AQZk3yTn7Qv2LmRdX8pWc4vBnM6hJ1kL9sT3uY7iO0a";
const LINK = `https://securesend.dev/s/7hK2mQ#${KEY}`;
const TOKEN = "the-management-token";
const ID = "7hK2mQ";

const MINUTE_MS = 60_000;

interface Post {
  body: string;
  url: string;
}

interface Message {
  blocks: { elements?: unknown[]; text?: { text: string }; type: string }[];
  response_type: string;
  text: string;
  unfurl_links?: boolean;
}

interface Button {
  text: { text: string };
  value: string;
}

const real = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = real;
});

/** A Slack that takes anything and says nothing back worth reading. */
function slack(): Post[] {
  const posted: Post[] = [];

  globalThis.fetch = (input, init) => {
    posted.push({ body: String(init?.body ?? ""), url: String(input) });
    return Promise.resolve(new Response(null, { status: 200 }));
  };

  return posted;
}

/** The message as Slack receives it, still as the text it was sent as. */
function textIn(post: Post): string {
  return new URLSearchParams(post.body).get("payload") ?? "";
}

function messageIn(post: Post): Message {
  return JSON.parse(textIn(post)) as Message;
}

function blockIn(post: Post, kind: string) {
  return messageIn(post).blocks.find((block) => block.type === kind);
}

function buttonsIn(post: Post): Button[] {
  return (blockIn(post, "actions")?.elements ?? []) as Button[];
}

function bothOf(posted: Post[]): [Post, Post] {
  const [channel, controls] = posted;

  if (!(channel && controls)) {
    throw new Error("both messages did not go out");
  }

  return [channel, controls];
}

function sending(fill: { expiry?: "1h" | "24h" | "72h"; now?: number } = {}) {
  const posted = slack();

  postToChannel({
    context: CONTEXT,
    expiry: fill.expiry ?? "24h",
    id: ID,
    link: LINK,
    managementToken: TOKEN,
    now: fill.now ?? CONTEXT.issuedAt + MINUTE_MS,
  });

  return posted;
}

describe("postToChannel", () => {
  it("posts both messages to the handle the command left, form encoded", () => {
    const posted = sending();

    expect(posted).toHaveLength(2);
    for (const one of posted) {
      expect(one.url).toBe(CONTEXT.responseUrl);
      expect(one.body.startsWith("payload=")).toBe(true);
    }
  });

  it("puts the whole link in the channel, with no button anywhere near it", () => {
    const [channel] = bothOf(sending());
    const said = textIn(channel);

    expect(messageIn(channel).response_type).toBe("in_channel");
    expect(messageIn(channel).unfurl_links).toBe(false);
    expect(said).toContain(LINK);
    expect(said).not.toContain("button");
    expect(said).not.toContain("actions");
    // The token can destroy the secret, and everybody in the channel reads this.
    expect(said).not.toContain(TOKEN);
  });

  /* Written out rather than hidden behind a shorter label. A label reads better
   * and loses the key for anybody who copies the line instead of pressing it,
   * which in a product whose link IS the key is a dead handover nobody is told
   * about. Pinned here because the prettier version is the tempting one. */
  it("writes the link out whole, with nothing standing in for it", () => {
    const line = blockIn(bothOf(sending())[0], "section")?.text?.text ?? "";

    expect(line.endsWith(`\n${LINK}`)).toBe(true);
    // The two spellings of a label standing in for the address.
    expect(line).not.toContain("…");
    expect(line).not.toContain("|");
  });

  it("puts the buttons where the link is not", () => {
    const [, controls] = bothOf(sending());
    const said = textIn(controls);

    expect(messageIn(controls).response_type).toBe("ephemeral");
    expect(said).not.toContain(LINK);
    expect(said).not.toContain(KEY);
    expect(said).not.toContain("securesend.dev");

    expect(
      buttonsIn(controls).map((button) => JSON.parse(button.value) as unknown)
    ).toStrictEqual([
      { do: "extend48", id: ID, managementToken: TOKEN },
      { do: "extend72", id: ID, managementToken: TOKEN },
      { do: "burn", id: ID, managementToken: TOKEN },
    ]);
  });

  /* The whole separation, asked as one question. If this ever counts two, the
   * message carrying the buttons is carrying the key as well, and the first press
   * on it hands that key to our own server. */
  it("puts the key in exactly one of the two bodies", () => {
    const carrying = sending().filter((one) => textIn(one).includes(KEY));

    expect(carrying).toHaveLength(1);
  });

  it("offers only the extensions that are longer than what the secret has", () => {
    const [, controls] = bothOf(sending({ expiry: "72h" }));

    expect(buttonsIn(controls).map((button) => button.text.text)).toStrictEqual(
      ["burn now"]
    );
  });

  it("says the expiry the secret was actually made with", () => {
    const [channel, controls] = bothOf(sending({ expiry: "1h" }));

    expect(textIn(channel)).toContain("expires in 1 hour · one view");
    expect(messageIn(controls).text).toBe("expires in 1 hour");
  });

  /* A display name arrives in the fragment, which is the one input a stranger can
   * write. Left as markup it would forge a second link in the one message whose
   * entire job is to carry exactly one. */
  it("posts a sender's name as text rather than as markup", () => {
    const posted = slack();

    postToChannel({
      context: { ...CONTEXT, senderName: "<https://evil.test|press here>" },
      expiry: "24h",
      id: ID,
      link: LINK,
      managementToken: TOKEN,
      now: CONTEXT.issuedAt,
    });

    const [channel] = bothOf(posted);
    expect(textIn(channel)).not.toContain("<https://evil.test");
    expect(textIn(channel)).toContain("&lt;https://evil.test|press here&gt;");
  });

  it("posts nothing at all once the handle is past its window", () => {
    expect(sending({ now: CONTEXT.issuedAt + 31 * MINUTE_MS })).toStrictEqual(
      []
    );
  });

  it("still posts on the last minute of the window", () => {
    expect(sending({ now: CONTEXT.issuedAt + 29 * MINUTE_MS })).toHaveLength(2);
  });
});

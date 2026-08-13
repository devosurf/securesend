import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { closeDatabase } from "../db/client";
import { env } from "../env";
import { mintManagementToken } from "./management";
import { expire, rowOf, seal } from "./testing";

afterAll(closeDatabase);

/*
 * Extending a secret's expiry, driven from the place it is pressed.
 *
 * The route is the boundary and there is no other door: nothing in the product can
 * move an expiry except a button on the sender's own controls message, so that is
 * where this is asserted rather than against the function underneath it.
 *
 * The target is hours from creation, which is what makes the ceiling hold under any
 * number of presses. Everything here is measured off the row's own createdAt for
 * the same reason: hours from now would drift by however long a test took.
 */

const OK = 200;

const A_SECOND = 1000;
const AN_HOUR = 60 * 60 * A_SECOND;

const SIGNING_SECRET = "8f742231b10e8888abcd99yyyzzz85a5";

const BURN_NOW = "burn now";
const SPENT = "the link above now opens to nothing";

const configured = env.slack.signingSecret;

beforeEach(() => {
  env.slack.signingSecret = SIGNING_SECRET;
});

afterAll(() => {
  env.slack.signingSecret = configured;
});

function slackHeaders(body: string) {
  const timestamp = String(Math.floor(Date.now() / A_SECOND));
  const digest = createHmac("sha256", SIGNING_SECRET)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex");

  return {
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": `v0=${digest}`,
  };
}

interface Reply {
  blocks: readonly {
    elements?: readonly { text?: { text: string } }[];
    text?: { text: string };
    type: string;
  }[];
}

/** One signed press, answered, or a loud failure if the route refused it. */
async function press(value: unknown): Promise<Reply> {
  const body = new URLSearchParams({
    payload: JSON.stringify({
      actions: [{ type: "button", value: JSON.stringify(value) }],
      type: "block_actions",
    }),
  }).toString();

  const response = await app.request("/api/slack/interactions", {
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...slackHeaders(body),
    },
    method: "POST",
  });

  if (response.status !== OK) {
    throw new Error(`the route refused a signed press: ${response.status}`);
  }

  return (await response.json()) as Reply;
}

function extend(
  secret: { id: string; managementToken: string },
  target: 48 | 72
) {
  return press({
    do: `extend${target}`,
    id: secret.id,
    managementToken: secret.managementToken,
  });
}

function said(reply: Reply): string {
  return (
    reply.blocks.find((block) => block.type === "section")?.text?.text ?? ""
  );
}

function labels(reply: Reply): string[] {
  return reply.blocks.flatMap((block) =>
    block.type === "actions"
      ? (block.elements ?? []).map((element) => element.text?.text ?? "")
      : []
  );
}

/** How long the row says the secret was given, in hours from its own creation. */
async function lifetimeOf(id: string): Promise<number> {
  const row = await rowOf(id);

  return Math.round(
    (row.expiresAt.getTime() - row.createdAt.getTime()) / AN_HOUR
  );
}

describe("extending an expiry", () => {
  it("moves a 24 hour secret to 48, and says so", async () => {
    const sealed = await seal();

    const reply = await extend(sealed, 48);

    expect(said(reply)).toBe("expires in 48 hours");
    expect(await lifetimeOf(sealed.id)).toBe(48);
  });

  it("moves a 24 hour secret to 72", async () => {
    const sealed = await seal();

    const reply = await extend(sealed, 72);

    expect(said(reply)).toBe("expires in 72 hours");
    expect(await lifetimeOf(sealed.id)).toBe(72);
  });

  /* An affordance that has been spent does not come back, so what is offered is
   * whatever is still longer than the clock now set. */
  it("stops offering an extension once it has been taken", async () => {
    const sealed = await seal();

    expect(labels(await extend(sealed, 48))).toStrictEqual([
      "72 hours",
      BURN_NOW,
    ]);
    expect(labels(await extend(sealed, 72))).toStrictEqual([BURN_NOW]);
  });

  it("offers nothing but a burn to a secret created at 72 hours", async () => {
    const sealed = await seal("72h");

    const reply = await extend(sealed, 72);

    expect(said(reply)).toBe("expires in 72 hours");
    expect(labels(reply)).toStrictEqual([BURN_NOW]);
  });
});

describe("extending an expiry, refused", () => {
  it("never shortens a clock that is already longer", async () => {
    const sealed = await seal("72h");

    const reply = await extend(sealed, 48);

    expect(said(reply)).toBe("expires in 72 hours");
    expect(await lifetimeOf(sealed.id)).toBe(72);
  });

  /* 72 is the ceiling and it is the type, so no sequence of presses walks a secret
   * past it. Hours from creation rather than hours from now is what does that. */
  it("holds the 72 hour ceiling however many times it is pressed", async () => {
    const sealed = await seal();

    await extend(sealed, 72);
    await extend(sealed, 72);
    await extend(sealed, 48);

    expect(await lifetimeOf(sealed.id)).toBe(72);
  });

  it("will not extend a secret that has already been used", async () => {
    const sealed = await seal();
    await app.request(`/api/secrets/${sealed.id}/reveal`, { method: "POST" });

    const reply = await extend(sealed, 72);

    expect(said(reply)).toBe(`used · ${SPENT}`);
    expect(labels(reply)).toStrictEqual([]);
    expect(await lifetimeOf(sealed.id)).toBe(24);
  });

  it("will not extend a secret the sender burned", async () => {
    const sealed = await seal();
    await press({
      do: "burn",
      id: sealed.id,
      managementToken: sealed.managementToken,
    });

    const reply = await extend(sealed, 72);

    expect(said(reply)).toBe(`burned · ${SPENT}`);
    expect(labels(reply)).toStrictEqual([]);
    expect(await lifetimeOf(sealed.id)).toBe(24);
  });

  /* The one refusal that could have been written as a rescue, and is not. A clock
   * that has run out has run out: the recipient has already been told there is
   * nothing at that link. */
  it("will not extend a secret whose clock ran out first", async () => {
    const sealed = await seal();
    await expire(sealed.id);

    const reply = await extend(sealed, 72);

    expect(said(reply)).toBe(`expired · ${SPENT}`);
    expect(labels(reply)).toStrictEqual([]);
    expect((await rowOf(sealed.id)).expiresAt.getTime()).toBeLessThan(
      Date.now()
    );
  });

  it("refuses a token that does not manage this secret, and moves nothing", async () => {
    const sealed = await seal();

    const reply = await press({
      do: "extend72",
      id: sealed.id,
      managementToken: mintManagementToken(),
    });

    expect(said(reply)).toBe("nothing here manages that secret");
    expect(await lifetimeOf(sealed.id)).toBe(24);
  });
});

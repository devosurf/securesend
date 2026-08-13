import { describe, expect, it } from "vitest";
import {
  decodeSlackContext,
  encodeSlackContext,
  type SlackContext,
} from "./payload";

/*
 * The fragment payload, both ways.
 *
 * The fixture below is the string the web's own decoder is tested against too.
 * The two decoders are spelled separately on purpose, so the shared thing has to
 * be the bytes rather than the code: if this encoder ever writes something the
 * other side cannot read, one of the two tests goes red.
 *
 * The rest of this file is the decoder taking a stranger's writing. Anything
 * that is not the shape is no context at all, and the create surface then
 * behaves exactly as it does for somebody who arrived without Slack.
 */

const CONTEXT: SlackContext = {
  channelId: "C024BE91L",
  channelName: "eng-infra",
  issuedAt: 1_700_000_000_000,
  responseUrl: "https://hooks.slack.com/commands/T0001/1234/abcd",
  senderName: "Marta Ek",
  teamId: "T0001",
};

const FIXTURE =
  "eyJjaGFubmVsSWQiOiJDMDI0QkU5MUwiLCJjaGFubmVsTmFtZSI6ImVuZy1pbmZyYSIsImlzc3VlZEF0IjoxNzAwMDAwMDAwMDAwLCJyZXNwb25zZVVybCI6Imh0dHBzOi8vaG9va3Muc2xhY2suY29tL2NvbW1hbmRzL1QwMDAxLzEyMzQvYWJjZCIsInNlbmRlck5hbWUiOiJNYXJ0YSBFayIsInRlYW1JZCI6IlQwMDAxIn0";

/** base64url and nothing else. */
const URL_SAFE = /^[\w-]+$/;

function encoded(context: unknown): string {
  return Buffer.from(JSON.stringify(context), "utf8").toString("base64url");
}

describe("the slack fragment payload", () => {
  it("comes back as it went in", () => {
    expect(decodeSlackContext(encodeSlackContext(CONTEXT))).toStrictEqual(
      CONTEXT
    );
  });

  it("writes the fixture the other side reads", () => {
    expect(encodeSlackContext(CONTEXT)).toBe(FIXTURE);
    expect(decodeSlackContext(FIXTURE)).toStrictEqual(CONTEXT);
  });

  /* base64url and nothing else, because it rides a url fragment: a payload
   * needing to be escaped is a payload something in the chain will mangle. */
  it("writes nothing a url has to escape", () => {
    expect(encodeSlackContext(CONTEXT)).toMatch(URL_SAFE);
  });
});

describe("the slack fragment payload, refused", () => {
  it("is no context when it is not base64url of anything", () => {
    expect(decodeSlackContext("")).toBeNull();
    expect(decodeSlackContext("not a payload at all")).toBeNull();
    expect(decodeSlackContext("%%%%")).toBeNull();
  });

  it("is no context when it was cut short", () => {
    expect(decodeSlackContext(FIXTURE.slice(0, 40))).toBeNull();
    expect(decodeSlackContext(FIXTURE.slice(4))).toBeNull();
  });

  it("is no context when the json is some other object", () => {
    expect(decodeSlackContext(encoded({ hello: "world" }))).toBeNull();
    expect(decodeSlackContext(encoded([CONTEXT]))).toBeNull();
    expect(decodeSlackContext(encoded("a string"))).toBeNull();
    expect(decodeSlackContext(encoded(null))).toBeNull();
  });

  /* The two decoders have to answer the same way or a sender is dropped back onto
   * the ordinary create surface with nothing on screen to say why. The channel's
   * name is required because the primary button says it; the display name is not,
   * because an absent one costs a line of copy. Spelled on both sides. */
  it("needs a channel to name, and tolerates a sender without one", () => {
    expect(
      decodeSlackContext(encoded({ ...CONTEXT, channelName: "" }))
    ).toBeNull();
    expect(
      decodeSlackContext(encoded({ ...CONTEXT, senderName: "" }))
    ).toStrictEqual({ ...CONTEXT, senderName: "" });
  });

  it("is no context when a field is missing or the wrong type", () => {
    const { teamId: _dropped, ...missing } = CONTEXT;

    expect(decodeSlackContext(encoded(missing))).toBeNull();
    expect(
      decodeSlackContext(encoded({ ...CONTEXT, issuedAt: "recently" }))
    ).toBeNull();
    expect(
      decodeSlackContext(encoded({ ...CONTEXT, channelId: "" }))
    ).toBeNull();
  });

  // Every key here is one this product wrote, so a payload carrying more than
  // these was not ours.
  it("is no context when it carries a field we never wrote", () => {
    expect(
      decodeSlackContext(encoded({ ...CONTEXT, key: "not on your life" }))
    ).toBeNull();
  });

  /* The one that is an attack rather than a mistake. A link anybody can hand a
   * sender would otherwise be a create surface that posts the finished link,
   * key and all, at whatever address the link named. */
  it("is no context when the reply handle points somewhere else", () => {
    const elsewhere = [
      "https://hooks.slack.com.example.com/commands/T0001/1234/abcd",
      "http://hooks.slack.com/commands/T0001/1234/abcd",
      "https://example.com/commands/T0001/1234/abcd",
      "not a url",
    ];

    for (const responseUrl of elsewhere) {
      expect(
        decodeSlackContext(encoded({ ...CONTEXT, responseUrl }))
      ).toBeNull();
    }
  });
});

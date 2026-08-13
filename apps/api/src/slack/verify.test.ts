import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type SlackRequest, verifySlackRequest } from "./verify";

/*
 * The trust boundary for both Slack routes, driven on its own.
 *
 * It is a pure function over a request's bytes, so it is tested as one: there is
 * no clock to wait on and no instance to stand up, and the replay window is only
 * assertable at all because the time is passed in.
 *
 * The signature here is spelled by hand rather than by the code under test,
 * exactly the way Slack's documentation spells it. A test that signed with the
 * same helper the route verifies with would pass whatever both of them agreed
 * to, including agreeing on the wrong thing.
 */

const SECRET = "8f742231b10e8888abcd99yyyzzz85a5";
const BODY = "command=%2Fss&text=&channel_id=C024BE91L";

const A_SECOND = 1000;
const NOW = 1_700_000_000_000;
const AT = "1700000000";

const WINDOW_SECONDS = 300;
const A_DAY = 24 * 60 * 60;

function signature(body: string, timestamp: string, secret = SECRET): string {
  const digest = createHmac("sha256", secret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex");

  return `v0=${digest}`;
}

/** The request as Slack would have sent it, for a test to spoil one field of. */
function slackSent(): SlackRequest {
  return {
    body: BODY,
    now: NOW,
    signature: signature(BODY, AT),
    signingSecret: SECRET,
    timestamp: AT,
  };
}

/** A timestamp this many seconds either side of the fixed now. */
function secondsOff(offset: number): string {
  return String(NOW / A_SECOND + offset);
}

describe("verifySlackRequest", () => {
  it("passes a request Slack signed", () => {
    expect(verifySlackRequest(slackSent())).toBe(true);
  });

  it("passes at either edge of the window", () => {
    const edges = [-WINDOW_SECONDS, WINDOW_SECONDS].map((offset) =>
      secondsOff(offset)
    );

    for (const timestamp of edges) {
      expect(
        verifySlackRequest({
          ...slackSent(),
          signature: signature(BODY, timestamp),
          timestamp,
        })
      ).toBe(true);
    }
  });

  it("refuses a signature made with another secret", () => {
    expect(
      verifySlackRequest({
        ...slackSent(),
        signature: signature(BODY, AT, "somebody else's secret"),
      })
    ).toBe(false);
  });

  it("refuses a signature made over other bytes", () => {
    expect(
      verifySlackRequest({
        ...slackSent(),
        signature: signature(`${BODY}&extra=1`, AT),
      })
    ).toBe(false);
  });

  it("refuses a body that changed under a good signature", () => {
    expect(
      verifySlackRequest({ ...slackSent(), body: `${BODY}&extra=1` })
    ).toBe(false);
  });

  it("refuses a signature that is not there", () => {
    expect(verifySlackRequest({ ...slackSent(), signature: undefined })).toBe(
      false
    );
    expect(verifySlackRequest({ ...slackSent(), signature: "" })).toBe(false);
  });

  it("refuses a timestamp that is not there", () => {
    expect(verifySlackRequest({ ...slackSent(), timestamp: undefined })).toBe(
      false
    );
  });

  it("refuses a timestamp that is not a number", () => {
    expect(verifySlackRequest({ ...slackSent(), timestamp: "recently" })).toBe(
      false
    );
  });

  /* Both directions. Behind is the replay, and ahead is the same request held
   * against a clock that has run on. */
  it("refuses a timestamp outside the window, either way", () => {
    const outside = [-WINDOW_SECONDS - 1, WINDOW_SECONDS + 1].map((offset) =>
      secondsOff(offset)
    );

    for (const timestamp of outside) {
      expect(
        verifySlackRequest({
          ...slackSent(),
          signature: signature(BODY, timestamp),
          timestamp,
        })
      ).toBe(false);
    }
  });

  /* A signature over the right bytes at a time long past. Nothing about the
   * digest is wrong, which is the whole reason the window is checked at all. */
  it("refuses yesterday's request however well it was signed", () => {
    const timestamp = secondsOff(-A_DAY);

    expect(
      verifySlackRequest({
        ...slackSent(),
        signature: signature(BODY, timestamp),
        timestamp,
      })
    ).toBe(false);
  });
});

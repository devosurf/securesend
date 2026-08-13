import { bytesToBase64url } from "@securesend/crypto/base64url";
import { describe, expect, it } from "vitest";
import { readSlackContext, type SlackContext } from "./payload";

/*
 * The decoder, against what the command route writes and against everything else.
 *
 * The fixture is a real payload and it is a literal on purpose: it is the one
 * place the api's encoder and this decoder can disagree, so both sides read the
 * same string rather than each other's code.
 *
 * The rest of this file is a stranger's writing. The address bar is the one input
 * anybody can fill in, and every one of these has to come back as no context at
 * all rather than as a half-read one.
 */

const FIXTURE =
  "eyJjaGFubmVsSWQiOiJDMDI0QkU5MUwiLCJjaGFubmVsTmFtZSI6ImVuZy1pbmZyYSIsImlzc3VlZEF0IjoxNzAwMDAwMDAwMDAwLCJyZXNwb25zZVVybCI6Imh0dHBzOi8vaG9va3Muc2xhY2suY29tL2NvbW1hbmRzL1QwMDAxLzEyMzQvYWJjZCIsInNlbmRlck5hbWUiOiJNYXJ0YSBFayIsInRlYW1JZCI6IlQwMDAxIn0";

const CONTEXT: SlackContext = {
  channelId: "C024BE91L",
  channelName: "eng-infra",
  issuedAt: 1_700_000_000_000,
  responseUrl: "https://hooks.slack.com/commands/T0001/1234/abcd",
  senderName: "Marta Ek",
  teamId: "T0001",
};

const utf8 = new TextEncoder();

/** The encoder's half of the wire format, so a test can write a fragment. */
function written(payload: unknown): string {
  return `#slack=${bytesToBase64url(utf8.encode(JSON.stringify(payload)))}`;
}

describe("readSlackContext", () => {
  it("reads the fragment the command route wrote", () => {
    expect(readSlackContext(`#slack=${FIXTURE}`)).toStrictEqual(CONTEXT);
  });

  it("reads it whether or not the hash came with it", () => {
    expect(readSlackContext(`slack=${FIXTURE}`)).toStrictEqual(CONTEXT);
  });

  /* The payload on its own, which is the shape the api encodes and the shape both
   * sides of this wire format pin themselves to. */
  it("reads the payload without the fragment around it", () => {
    expect(readSlackContext(FIXTURE)).toStrictEqual(CONTEXT);
  });

  it("round-trips whatever the encoder wrote", () => {
    expect(readSlackContext(written(CONTEXT))).toStrictEqual(CONTEXT);
  });

  it("reads a channel name with a space and a workspace name with punctuation", () => {
    const odd = { ...CONTEXT, channelName: "eng infra", senderName: "Ada L." };

    expect(readSlackContext(written(odd))).toStrictEqual(odd);
  });

  it.each([
    ["nothing at all", ""],
    ["a bare hash", "#"],
    ["somebody else's fragment", "#access_token=abc123"],
    [
      "a secret's own fragment token",
      "#AQZk3yTn7Qv2LmRdX8pWc4vBnM6hJ1kL9sT3uY",
    ],
    ["garbage", "#slack=not base64url at all!!"],
    ["an empty payload", "#slack="],
    ["a truncated payload", `#slack=${FIXTURE.slice(0, 40)}`],
    ["one character short", `#slack=${FIXTURE.slice(0, -1)}`],
  ])("reads no context from %s", (_what, fragment) => {
    expect(readSlackContext(fragment)).toBeNull();
  });

  it.each([
    ["a string", "eng-infra"],
    ["a number", 12],
    ["null", null],
    ["a list", [CONTEXT]],
  ])("reads no context from json that is %s", (_what, payload) => {
    expect(readSlackContext(written(payload))).toBeNull();
  });

  it.each([
    ["a missing channel", { ...CONTEXT, channelName: undefined }],
    ["an empty channel", { ...CONTEXT, channelName: "" }],
    ["a missing team", { ...CONTEXT, teamId: undefined }],
    ["a stamp that is a string", { ...CONTEXT, issuedAt: "1786000000000" }],
    ["a stamp that is not a number", { ...CONTEXT, issuedAt: Number.NaN }],
    ["a missing reply handle", { ...CONTEXT, responseUrl: undefined }],
  ])("reads no context from an object with %s", (_what, payload) => {
    expect(readSlackContext(written(payload))).toBeNull();
  });

  /* The handle decides where this browser posts the finished link, and the
   * finished link is the key. An address bar that could aim that post anywhere
   * would be the one way the zero-knowledge rule could be talked out of. */
  it.each([
    ["somewhere else entirely", "https://hooks.example.com/commands/T0/1/2"],
    ["a lookalike host", "https://hooks.slack.com.evil.test/commands/T0/1/2"],
    ["the same host without tls", "http://hooks.slack.com/commands/T0/1/2"],
    ["a path on our own instance", "/api/slack/command"],
  ])("reads no context from a reply handle pointing at %s", (_what, url) => {
    expect(
      readSlackContext(written({ ...CONTEXT, responseUrl: url }))
    ).toBeNull();
  });
});

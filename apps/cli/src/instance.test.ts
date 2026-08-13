import { describe, expect, it } from "vitest";
import {
  asOrigin,
  HOSTED_INSTANCE,
  instanceForCreate,
  instanceForLink,
} from "./instance";

const FLAG = "https://flag.example";
const CONFIGURED = "https://configured.example";
const FROM_LINK = "https://link.example";

describe("asOrigin", () => {
  it("drops a trailing slash, because every url built from it adds one", () => {
    expect(asOrigin("https://securesend.dev/")).toBe("https://securesend.dev");
  });

  it("fills in a scheme nobody typed", () => {
    expect(asOrigin("securesend.dev")).toBe("https://securesend.dev");
  });

  it("keeps a port", () => {
    expect(asOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("refuses an address an instance could not answer on", () => {
    expect(() => asOrigin("file:///etc/passwd")).toThrow("http");
  });
});

describe("instanceForCreate", () => {
  it("sends to ours when nobody said otherwise", () => {
    expect(instanceForCreate(undefined, undefined)).toBe(HOSTED_INSTANCE);
  });

  it("takes the variable a self-hoster set once", () => {
    expect(instanceForCreate(undefined, CONFIGURED)).toBe(CONFIGURED);
  });

  it("lets a flag beat the variable, so a one-off needs no unsetting", () => {
    expect(instanceForCreate(FLAG, CONFIGURED)).toBe(FLAG);
  });

  it("treats an empty variable as one nobody set", () => {
    expect(instanceForCreate(undefined, "")).toBe(HOSTED_INSTANCE);
  });
});

describe("instanceForLink", () => {
  it("uses the origin the link carries", () => {
    expect(instanceForLink(FROM_LINK, undefined)).toBe(FROM_LINK);
  });

  it("lets only an explicit flag beat the link", () => {
    expect(instanceForLink(FROM_LINK, FLAG)).toBe(FLAG);
  });
});

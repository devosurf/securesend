import {
  encodeFragmentToken,
  newFragmentToken,
} from "@securesend/crypto/fragment";
import { newSecretId } from "@securesend/crypto/ids";
import { describe, expect, it } from "vitest";
import { parseLink, secretHref } from "./link";

const id = newSecretId();
const fragment = encodeFragmentToken(newFragmentToken(false));
const locked = encodeFragmentToken(newFragmentToken(true));

describe("parseLink", () => {
  it("reads a whole link", () => {
    const link = parseLink(`https://securesend.dev/s/${id}#${fragment}`);

    expect(link.origin).toBe("https://securesend.dev");
    expect(link.id).toBe(id);
    expect(link.key.status).toBe("ok");
  });

  it("fills in the scheme a chat client ate", () => {
    const link = parseLink(`securesend.dev/s/${id}#${fragment}`);

    expect(link.origin).toBe("https://securesend.dev");
    expect(link.id).toBe(id);
  });

  it("keeps the port and the scheme of a self-hosted instance", () => {
    const link = parseLink(`http://localhost:3000/s/${id}#${fragment}`);

    expect(link.origin).toBe("http://localhost:3000");
  });

  it("says whether the key needs a password too", () => {
    const link = parseLink(`https://securesend.dev/s/${id}#${locked}`);

    expect(link.key).toMatchObject({
      status: "ok",
      token: { needsPassword: true },
    });
  });

  it("takes a link with no fragment, because two commands do not need one", () => {
    const link = parseLink(`https://securesend.dev/s/${id}`);

    expect(link.id).toBe(id);
    expect(link.key.status).toBe("incomplete");
  });

  it("calls a truncated fragment incomplete rather than an error", () => {
    const link = parseLink(
      `https://securesend.dev/s/${id}#${fragment.slice(0, 10)}`
    );

    expect(link.key.status).toBe("incomplete");
  });

  it("refuses an id this product could not have made", () => {
    expect(() => parseLink("https://securesend.dev/s/not-an-id")).toThrow(
      "secret id"
    );
  });

  it("refuses anything that is not a link to a secret", () => {
    expect(() => parseLink("https://securesend.dev/security")).toThrow(
      "not a secret link"
    );
    expect(() => parseLink("::::")).toThrow("not a secret link");
  });

  it("never quotes what it was given, because the fragment is the key", () => {
    const damaged = `https://securesend.dev/s/nope#${fragment}`;

    expect(() => parseLink(damaged)).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(fragment),
      })
    );
  });
});

describe("secretHref", () => {
  it("writes the one line a sender passes on", () => {
    expect(secretHref("https://securesend.dev", id, fragment)).toBe(
      `https://securesend.dev/s/${id}#${fragment}`
    );
  });
});

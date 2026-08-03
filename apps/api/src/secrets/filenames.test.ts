import { randomBytes } from "node:crypto";
import { openEnvelope, sealEnvelope } from "@securesend/crypto/envelope";
import { decodeFragmentToken } from "@securesend/crypto/fragment";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { closeDatabase } from "../db/client";
import { attachmentRowsOf, rowOf } from "./testing";

afterAll(closeDatabase);

/*
 * The claim that this instance never sees a filename, checked where a real
 * filename and the real storage both exist.
 *
 * This is a claims audit rather than a behaviour test, and it is the one place in
 * the api's tests that encrypts something first. Everywhere else the fixtures are
 * random bytes on purpose, because to these routes an envelope is opaque and a
 * test that encrypted would be asserting something the route does not promise.
 * Here the route's opacity is exactly what is on trial: the homepage says we never
 * hold the contents or the filenames, and the only way to check that sentence is
 * to seal a file with a name somebody would recognise and then go looking for the
 * name in everything the instance ends up holding and saying.
 *
 * The byte-for-byte half rides along because it is the same crossing. Between the
 * two of them this is the whole of what a file handover promises: what comes out
 * is what went in, and nothing on the way ever knew what it was called.
 */

const CREATED = 201;
const OK = 200;

const NAME = "northwind-vpn-profile.ovpn";
const TYPE = "application/x-openvpn-profile";

/** Big enough to be a real attachment rather than a rounding error. */
const SIZE = 64 * 1024;

/** Every word of the filename an eye could pick out of a hex dump. */
const GIVEAWAYS = [NAME, "northwind", "ovpn", "openvpn", "profile"];

/** Bytes as text, so a search finds the name however it happens to be encoded. */
function readable(...parts: Uint8Array[]): string {
  return Buffer.concat(parts.map((part) => Buffer.from(part))).toString(
    "latin1"
  );
}

async function post(body: unknown) {
  return await app.request("/api/secrets", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("a file handed over end to end", () => {
  it("comes back byte for byte, and is never named anywhere on the way", async () => {
    const bytes = new Uint8Array(randomBytes(SIZE));
    const sealed = await sealEnvelope({
      files: [{ bytes, name: NAME, type: TYPE }],
      note: "vpn access for the migration",
    });
    const { id } = sealed.stored;

    const created = await post({
      attachments: sealed.stored.attachments,
      envelope: sealed.stored.envelope,
      expiry: "24h",
      id,
    });
    expect(created.status).toBe(CREATED);

    /* What the instance is now holding. Not "no name column": no name, in any of
     * the bytes, which is the claim as a reader of the security page would test
     * it. */
    const row = await rowOf(id);
    const files = await attachmentRowsOf(id);
    const stored = readable(
      row.envelope ?? new Uint8Array(),
      ...files.map((one) => one.ciphertext)
    );

    for (const giveaway of GIVEAWAYS) {
      expect(stored).not.toContain(giveaway);
    }
    expect(files).toHaveLength(1);
    expect(files[0]?.ciphertext.length).toBeGreaterThanOrEqual(SIZE);

    const revealed = await app.request(`/api/secrets/${id}/reveal`, {
      method: "POST",
    });
    expect(revealed.status).toBe(OK);

    const said = await revealed.text();
    for (const giveaway of GIVEAWAYS) {
      expect(said).not.toContain(giveaway);
    }

    const released = JSON.parse(said) as {
      attachments: { ciphertext: string; index: number; iv: string }[];
      envelope: { ciphertext: string; iv: string };
    };
    const read = decodeFragmentToken(sealed.fragmentToken);
    if (read.status !== "ok") {
      throw new Error("the fixture's own token did not decode");
    }

    const opened = await openEnvelope({
      stored: { ...released, id },
      token: read.token,
    });

    /* The name and the type were in the envelope all along, which is where the
     * recipient gets them from and the instance never did. */
    expect(opened.files).toStrictEqual([
      { bytes, name: NAME, size: SIZE, type: TYPE },
    ]);

    expect(await attachmentRowsOf(id)).toStrictEqual([]);
  });
});

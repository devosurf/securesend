import { describe, expect, it } from "vitest";
import { base64urlToBytes, bytesToBase64url } from "./base64url";
import {
  type AttachmentCiphertext,
  DecryptionFailedError,
  InvalidEnvelopeError,
  type OpenedEnvelope,
  openEnvelope,
  type SealedEnvelope,
  sealEnvelope,
} from "./envelope";
import { decodeFragmentToken, type FragmentToken } from "./fragment";
import { isSecretId, newSecretId } from "./ids";

const PASSWORD = "northwind";

const DECRYPTION_FAILED = /wrong key, wrong password, or tampered/;
const NEEDS_ONE_PART = /at least one part/;
const EMPTY_PASSWORD = /password cannot be empty/;
const NEEDS_A_PASSWORD = /needs a password/;
const TAKES_NO_PASSWORD = /takes no password/;

const NOTE = "the wifi is on the fridge, northwindnotemarker";
const CREDENTIALS = {
  password: "hunter2passwordmarker",
  username: "admincredentialmarker",
};

function file(name: string, body: string) {
  return {
    bytes: new TextEncoder().encode(body),
    name,
    type: "text/plain",
  };
}

const FILES = [
  file("recoverycodesmarker.txt", "111111 222222"),
  file("vpnprofilemarker.ovpn", "remote vpn.example 1194"),
];

function tokenOf(sealed: SealedEnvelope): FragmentToken {
  const result = decodeFragmentToken(sealed.fragmentToken);

  if (result.status !== "ok") {
    throw new Error("expected the token to decode");
  }

  return result.token;
}

function openSealed(
  sealed: SealedEnvelope,
  password?: string
): Promise<OpenedEnvelope> {
  return openEnvelope({
    password,
    stored: sealed.stored,
    token: tokenOf(sealed),
  });
}

/** Flips a byte of a base64url field, the way a damaged row would. */
function tamper(value: string): string {
  const bytes = base64urlToBytes(value);
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  return bytesToBase64url(bytes);
}

function withAttachments(
  sealed: SealedEnvelope,
  attachments: AttachmentCiphertext[]
): SealedEnvelope {
  return { ...sealed, stored: { ...sealed.stored, attachments } };
}

/** getRandomValues stops at 65,536 bytes, and a size test does not need entropy. */
function patterned(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = (index * 31 + 7) % 256;
  }
  return bytes;
}

function opened(files: typeof FILES) {
  return files.map((source) => ({
    bytes: source.bytes,
    name: source.name,
    size: source.bytes.length,
    type: source.type,
  }));
}

describe("round trip", () => {
  it("carries a note on its own", async () => {
    const sealed = await sealEnvelope({ note: NOTE });

    expect(await openSealed(sealed)).toStrictEqual({ files: [], note: NOTE });
  });

  it("carries credentials on their own", async () => {
    const sealed = await sealEnvelope({ credentials: CREDENTIALS });

    expect(await openSealed(sealed)).toStrictEqual({
      credentials: CREDENTIALS,
      files: [],
    });
  });

  it("carries files on their own", async () => {
    const sealed = await sealEnvelope({ files: FILES });

    expect(sealed.stored.attachments).toHaveLength(2);
    expect(await openSealed(sealed)).toStrictEqual({ files: opened(FILES) });
  });

  it("carries every part at once", async () => {
    const sealed = await sealEnvelope({
      credentials: CREDENTIALS,
      files: FILES,
      note: NOTE,
    });

    expect(await openSealed(sealed)).toStrictEqual({
      credentials: CREDENTIALS,
      files: opened(FILES),
      note: NOTE,
    });
  });

  it("carries every part at once under a password", async () => {
    const sealed = await sealEnvelope(
      { credentials: CREDENTIALS, files: FILES, note: NOTE },
      PASSWORD
    );

    expect(tokenOf(sealed).needsPassword).toBe(true);
    expect(await openSealed(sealed, PASSWORD)).toStrictEqual({
      credentials: CREDENTIALS,
      files: opened(FILES),
      note: NOTE,
    });
  });

  it("carries text no byte of which is ascii", async () => {
    const note = "🔥 lösenordet är: åäö-Ω-日本語 🔥";
    const sealed = await sealEnvelope({ note });

    expect((await openSealed(sealed)).note).toBe(note);
  });

  it("carries bytes that are not text", async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(4096));
    const sealed = await sealEnvelope({
      files: [{ bytes, name: "keystore.p12", type: "application/x-pkcs12" }],
    });

    expect((await openSealed(sealed)).files[0]?.bytes).toStrictEqual(bytes);
  });

  it("gives every envelope a fresh id and key", async () => {
    const first = await sealEnvelope({ note: NOTE });
    const second = await sealEnvelope({ note: NOTE });

    expect(isSecretId(first.stored.id)).toBe(true);
    expect(first.stored.id).not.toBe(second.stored.id);
    expect(first.fragmentToken).not.toBe(second.fragmentToken);
    expect(tokenOf(first).needsPassword).toBe(false);
  });
});

describe("what leaves the browser", () => {
  it("carries no part of the secret in the clear", async () => {
    const sealed = await sealEnvelope({
      credentials: CREDENTIALS,
      files: FILES,
      note: NOTE,
    });
    const wire = JSON.stringify(sealed.stored);

    for (const marker of [
      "northwindnotemarker",
      "admincredentialmarker",
      "hunter2passwordmarker",
      "recoverycodesmarker",
      "vpnprofilemarker",
    ]) {
      expect(wire).not.toContain(marker);
    }
  });

  // The half that gets posted has to be postable whole. Serializing `stored` is
  // the obvious thing a caller will do, so the key must not be reachable from
  // it, by any spelling.
  it("keeps the key out of everything the server is given", async () => {
    const sealed = await sealEnvelope({ files: FILES, note: NOTE }, PASSWORD);
    const wire = JSON.stringify(sealed.stored);
    const token = tokenOf(sealed);

    expect(wire).not.toContain(sealed.fragmentToken);
    expect(wire).not.toContain(bytesToBase64url(token.key));
    expect(JSON.stringify(sealed)).toContain(sealed.fragmentToken);
  });

  // A filename is metadata the server must never hold, so it rides inside the
  // JSON envelope. Its bytes ride separately, which is what keeps a 10MB
  // attachment from inflating the part every envelope has.
  it("keeps the json envelope small however big an attachment is", async () => {
    const bytes = patterned(256 * 1024);
    const sealed = await sealEnvelope({
      files: [{ bytes, name: "backup.zip", type: "application/zip" }],
      note: NOTE,
    });

    const [attachment] = sealed.stored.attachments;
    if (!attachment) {
      throw new Error("expected an attachment");
    }

    expect(sealed.stored.envelope.ciphertext.length).toBeLessThan(512);
    expect(attachment.ciphertext.length).toBeGreaterThan(300_000);
  });

  it("gives every ciphertext its own iv", async () => {
    const sealed = await sealEnvelope({ files: FILES, note: NOTE });
    const ivs = [
      sealed.stored.envelope.iv,
      ...sealed.stored.attachments.map((attachment) => attachment.iv),
    ];

    expect(new Set(ivs).size).toBe(ivs.length);
    for (const iv of ivs) {
      expect(base64urlToBytes(iv)).toHaveLength(12);
    }
  });

  // Each attachment is encrypted on its own, so two identical files must not
  // produce identical ciphertexts. If they did, the server could tell that the
  // same bytes were sent twice.
  it("encrypts identical files to different ciphertexts", async () => {
    const twice = [
      file("first.txt", "same bytes"),
      file("second.txt", "same bytes"),
    ];
    const sealed = await sealEnvelope({ files: twice });
    const ciphertexts = sealed.stored.attachments.map((a) => a.ciphertext);

    expect(new Set(ciphertexts).size).toBe(2);
    expect(await openSealed(sealed)).toStrictEqual({ files: opened(twice) });
  });

  it("numbers the attachments in the order the files arrived", async () => {
    const sealed = await sealEnvelope({ files: FILES });

    expect(sealed.stored.attachments.map((a) => a.index)).toStrictEqual([0, 1]);
  });
});

describe("a wrong password", () => {
  it("fails locally and changes nothing, so the next try can succeed", async () => {
    const sealed = await sealEnvelope(
      { files: FILES, note: NOTE },
      "northwind"
    );
    const before = structuredClone(sealed);
    const token = tokenOf(sealed);
    const key = Uint8Array.from(token.key);

    await expect(openSealed(sealed, "northwinD")).rejects.toThrow(
      DecryptionFailedError
    );

    expect(sealed).toStrictEqual(before);
    expect(token.key).toStrictEqual(key);
    expect(await openSealed(sealed, PASSWORD)).toStrictEqual({
      files: opened(FILES),
      note: NOTE,
    });
  });

  it("is the same failure as a tampered ciphertext, told apart by nothing", async () => {
    const sealed = await sealEnvelope({ note: NOTE }, PASSWORD);

    await expect(openSealed(sealed, "")).rejects.toThrow(DECRYPTION_FAILED);
  });
});

describe("fails closed", () => {
  it("refuses an envelope moved to another id", async () => {
    const sealed = await sealEnvelope({ files: FILES, note: NOTE });

    await expect(
      openSealed({
        ...sealed,
        stored: { ...sealed.stored, id: newSecretId() },
      })
    ).rejects.toThrow(DecryptionFailedError);
  });

  it("refuses an attachment moved to another index", async () => {
    const sealed = await sealEnvelope({ files: FILES });
    const [first, second] = sealed.stored.attachments;
    if (!(first && second)) {
      throw new Error("expected two attachments");
    }

    await expect(
      openSealed(
        withAttachments(sealed, [
          { ...second, index: 0 },
          { ...first, index: 1 },
        ])
      )
    ).rejects.toThrow(DecryptionFailedError);
  });

  // The envelope and the attachments share one data key, so only the AAD keeps
  // one from being served as the other.
  it("refuses the envelope ciphertext served as an attachment", async () => {
    const sealed = await sealEnvelope({
      files: [file("codes.txt", "111111 222222")],
      note: NOTE,
    });

    await expect(
      openSealed(
        withAttachments(sealed, [{ ...sealed.stored.envelope, index: 0 }])
      )
    ).rejects.toThrow(DecryptionFailedError);
  });

  it("refuses a tampered envelope ciphertext", async () => {
    const sealed = await sealEnvelope({ note: NOTE });

    await expect(
      openSealed({
        ...sealed,
        stored: {
          ...sealed.stored,
          envelope: {
            ...sealed.stored.envelope,
            ciphertext: tamper(sealed.stored.envelope.ciphertext),
          },
        },
      })
    ).rejects.toThrow(DecryptionFailedError);
  });

  it("refuses a tampered iv", async () => {
    const sealed = await sealEnvelope({ note: NOTE });

    await expect(
      openSealed({
        ...sealed,
        stored: {
          ...sealed.stored,
          envelope: {
            ...sealed.stored.envelope,
            iv: tamper(sealed.stored.envelope.iv),
          },
        },
      })
    ).rejects.toThrow(DecryptionFailedError);
  });

  it("refuses a tampered attachment", async () => {
    const sealed = await sealEnvelope({ files: FILES });
    const [first, ...rest] = sealed.stored.attachments;
    if (!first) {
      throw new Error("expected an attachment");
    }

    await expect(
      openSealed(
        withAttachments(sealed, [
          { ...first, ciphertext: tamper(first.ciphertext) },
          ...rest,
        ])
      )
    ).rejects.toThrow(DecryptionFailedError);
  });

  // The other half of the fragment token's story: the one corruption the token
  // format cannot see is the one AES-GCM refuses here.
  it("refuses a key corrupted inside the fragment token", async () => {
    const sealed = await sealEnvelope({ note: NOTE });
    const token = tokenOf(sealed);
    const key = Uint8Array.from(token.key);
    key[0] = (key[0] ?? 0) ^ 0xff;

    await expect(
      openEnvelope({
        stored: sealed.stored,
        token: { key, needsPassword: false },
      })
    ).rejects.toThrow(DecryptionFailedError);
  });

  it("refuses an envelope one attachment short", async () => {
    const sealed = await sealEnvelope({ files: FILES });

    await expect(
      openSealed(withAttachments(sealed, sealed.stored.attachments.slice(0, 1)))
    ).rejects.toThrow(InvalidEnvelopeError);
  });

  it("refuses an envelope with an attachment it never declared", async () => {
    const sealed = await sealEnvelope({ files: FILES });
    const [extra] = sealed.stored.attachments;
    if (!extra) {
      throw new Error("expected an attachment");
    }

    await expect(
      openSealed(
        withAttachments(sealed, [
          ...sealed.stored.attachments,
          { ...extra, index: 2 },
        ])
      )
    ).rejects.toThrow(InvalidEnvelopeError);
  });

  it("refuses two attachments claiming one index", async () => {
    const sealed = await sealEnvelope({ files: FILES });
    const [first] = sealed.stored.attachments;
    if (!first) {
      throw new Error("expected an attachment");
    }

    await expect(
      openSealed(withAttachments(sealed, [first, first]))
    ).rejects.toThrow(InvalidEnvelopeError);
  });

  it("refuses bytes that are not a versioned envelope", async () => {
    const sealed = await sealEnvelope({ note: NOTE });
    const token = tokenOf(sealed);
    const key = await crypto.subtle.importKey(
      "raw",
      token.key,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        additionalData: new TextEncoder().encode(
          `securesend:v1:envelope:${sealed.stored.id}`
        ),
        iv,
        name: "AES-GCM",
      },
      key,
      new TextEncoder().encode(JSON.stringify({ note: NOTE, v: 99 }))
    );

    await expect(
      openSealed({
        ...sealed,
        stored: {
          ...sealed.stored,
          envelope: {
            ciphertext: bytesToBase64url(new Uint8Array(ciphertext)),
            iv: bytesToBase64url(iv),
          },
        },
      })
    ).rejects.toThrow(InvalidEnvelopeError);
  });
});

describe("guard rails", () => {
  it("refuses to seal an envelope with nothing in it", async () => {
    await expect(sealEnvelope({})).rejects.toThrow(NEEDS_ONE_PART);
    await expect(sealEnvelope({ files: [] })).rejects.toThrow(NEEDS_ONE_PART);
  });

  it("refuses to seal under an empty password", async () => {
    await expect(sealEnvelope({ note: NOTE }, "")).rejects.toThrow(
      EMPTY_PASSWORD
    );
  });

  it("refuses to open a sealed envelope without the password it needs", async () => {
    const sealed = await sealEnvelope({ note: NOTE }, PASSWORD);

    await expect(openSealed(sealed)).rejects.toThrow(NEEDS_A_PASSWORD);
  });

  it("refuses a password for an envelope that has none", async () => {
    const sealed = await sealEnvelope({ note: NOTE });

    await expect(openSealed(sealed, PASSWORD)).rejects.toThrow(
      TAKES_NO_PASSWORD
    );
  });
});

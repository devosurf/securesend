import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { bytesToBase64url } from "@securesend/crypto/base64url";

/*
 * The management token is the whole of a sender's authority over what they sent,
 * and there is no account behind it: whichever browser holds it can burn the
 * envelope early, and nothing else can.
 *
 * So it is issued once, in the create response, and never again. What the row
 * keeps is a SHA-256 of it. There is no salt and no work factor, because there
 * is no guessing to slow down: 256 bits of randomness has no dictionary and no
 * cheaper spelling. A stolen database yields hashes that open nothing.
 */

const TOKEN_BYTES = 32;

/** 32 bytes of base64url, which is what a caller should expect back. */
export const MANAGEMENT_TOKEN_LENGTH = 43;

export function mintManagementToken(): string {
  return bytesToBase64url(randomBytes(TOKEN_BYTES));
}

export function hashManagementToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Whether this token is the one that manages that row. Compared without leaking
 * how far the two got before they differed: a digest comparison that returns early
 * is not the weakness people think it is here, since guessing the token still costs
 * 256 bits, but a constant-time compare is one line and this is the only authority
 * in the product.
 */
export function managesSecret(token: string, hash: string): boolean {
  const offered = Buffer.from(hashManagementToken(token), "hex");
  const stored = Buffer.from(hash, "hex");

  return offered.length === stored.length && timingSafeEqual(offered, stored);
}

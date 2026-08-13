import {
  decodeFragmentToken,
  type FragmentTokenResult,
} from "@securesend/crypto/fragment";
import { isSecretId } from "@securesend/crypto/ids";

/*
 * Reading a secret link.
 *
 * Three things come out of one and the third is the key, so nothing here quotes
 * what it was handed. An error that echoed the link would put the key into a
 * shell's history, a CI log and the issue somebody pastes it into.
 *
 * A link that arrived without its fragment is not an error at all. Chat clients
 * truncate them and mail clients re-wrap them, and two of the four commands do
 * not need one. So the key comes back the way the crypto package reports it, and
 * the command that needs it is the command that complains.
 *
 * The scheme is optional because a link copied out of a chat window often loses
 * it, and a link is https or it is not this product.
 */

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** The one path shape this product has: `/s/<id>`. */
const SECRET_PATH_SEGMENTS = 2;

export interface SecretLink {
  id: string;
  /** Present when the link still carried a usable key, `incomplete` when not. */
  key: FragmentTokenResult;
  origin: string;
}

export function parseLink(value: string): SecretLink {
  const text = value.trim();
  const whole = SCHEME.test(text) ? text : `https://${text}`;

  if (!URL.canParse(whole)) {
    throw new Error("that is not a secret link");
  }

  const url = new URL(whole);
  const parts = url.pathname.split("/").filter((part) => part !== "");
  const [prefix, id] = parts;

  if (parts.length !== SECRET_PATH_SEGMENTS || prefix !== "s") {
    throw new Error("that is not a secret link");
  }
  if (id === undefined || !isSecretId(id)) {
    throw new Error("that link does not carry a secret id");
  }

  const fragment = url.hash.slice(1);

  return {
    id,
    key:
      fragment === ""
        ? { status: "incomplete" }
        : decodeFragmentToken(fragment),
    origin: url.origin,
  };
}

/** The whole link, which is the one thing a sender has to pass on. */
export function secretHref(
  origin: string,
  id: string,
  fragmentToken: string
): string {
  return `${origin}/s/${id}#${fragmentToken}`;
}

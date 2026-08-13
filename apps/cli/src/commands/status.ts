import { type SecretStatus, statusOf } from "../client";
import { instanceForLink } from "../instance";
import { parseLink } from "../link";

/*
 * Asking what became of a link without touching it.
 *
 * This is the command to run before consuming anything. It needs no fragment, so
 * a link that lost its key on the way through a chat client can still be asked
 * about, and it changes nothing at all: the answer is true at the moment it is
 * given and the secret is exactly as it was afterwards.
 *
 * The exit code carries the same answer as the words, so a script can branch on
 * it. Zero only for `sealed`: a link that is anything else is one somebody else
 * may already have read.
 */

export interface StatusOptions {
  instance?: string | undefined;
}

/** The state on its own line, then only the timestamps this secret really has. */
export function describe(secret: SecretStatus): string {
  const lines = [
    secret.state,
    `  created ${secret.createdAt}`,
    `  expires ${secret.expiresAt}`,
  ];

  if (secret.usedAt !== null) {
    lines.push(`  used ${secret.usedAt}`);
  }
  if (secret.burnedAt !== null) {
    lines.push(
      secret.burnReason === null
        ? `  burned ${secret.burnedAt}`
        : `  burned ${secret.burnedAt} by ${secret.burnReason}`
    );
  }

  return `${lines.join("\n")}\n`;
}

export async function status(
  link: string,
  options: StatusOptions
): Promise<number> {
  const secret = parseLink(link);
  const origin = instanceForLink(secret.origin, options.instance);
  const answer = await statusOf(origin, secret.id);

  process.stdout.write(describe(answer));

  return answer.state === "sealed" ? 0 : 1;
}

import { burnSecret } from "../client";
import { instanceForLink } from "../instance";
import { parseLink } from "../link";
import { askHidden, atTheKeyboard } from "../prompt";

/*
 * Destroying a secret early.
 *
 * The management token is the sender's whole authority over what they sent, and
 * this is the only command that uses it. No fragment is needed: burning takes the
 * id and the token and never the key, which is why the line `create` prints is
 * safe to keep in a ticket.
 *
 * A second press answers the same as the first, because the likeliest second
 * press is the panicked one.
 */

export interface BurnOptions {
  instance?: string | undefined;
  token?: string | undefined;
}

/**
 * The token, from the flag or from a keyboard. Offered at a prompt because a
 * flag's value is in the shell history of whoever typed it and in the process
 * list of the machine they typed it on.
 */
async function tokenFor(given: string | undefined): Promise<string> {
  if (given !== undefined && given !== "") {
    return given;
  }
  if (!atTheKeyboard()) {
    throw new Error(
      "pass the management token with --token; create printed it"
    );
  }

  const typed = await askHidden("Management token: ");
  if (typed === "") {
    throw new Error("no management token was given");
  }

  return typed;
}

export async function burn(
  link: string,
  options: BurnOptions
): Promise<number> {
  const secret = parseLink(link);
  const origin = instanceForLink(secret.origin, options.instance);
  const managementToken = await tokenFor(options.token);
  const answer = await burnSecret(origin, secret.id, managementToken);

  if (answer.status === "burned") {
    process.stdout.write("burned\n");

    return 0;
  }

  /* Nothing was burned, and the sender is owed which way it went instead: a
   * secret that was read is a different piece of news from one that expired. */
  process.stdout.write(`${answer.state.state}\n`);

  return 1;
}

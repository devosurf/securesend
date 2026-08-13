import { skillText } from "../skill-text";

/*
 * Printing the skill document.
 *
 * An agent that has the binary can read the rules of the road out of it, without
 * a network request and without being told where the repository is. Written
 * byte for byte, with no trailing newline of its own: what comes out is the file.
 */
export function skill(): number {
  process.stdout.write(skillText);

  return 0;
}

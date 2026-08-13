import { Command, Option } from "commander";
import manifest from "../package.json" with { type: "json" };
import { type BurnOptions, burn } from "./commands/burn";
import { type CreateOptions, create, EXPIRIES } from "./commands/create";
import { type RevealOptions, reveal } from "./commands/reveal";
import { type RunOptions, run } from "./commands/run";
import { skill } from "./commands/skill";
import { type StatusOptions, status } from "./commands/status";

/*
 * The program, and the one place an exit code is decided.
 *
 * Every command answers with the code it wants and throws when it cannot go on,
 * so nothing below this line has to remember to exit. A failure prints one
 * sentence and nothing else: a stack trace here would carry an origin, a link or
 * a fragment into whatever the terminal is being copied into, and the fragment
 * is the key.
 *
 * The commands after `--` belong to whatever `run` is running. Commander stops
 * reading options there on its own, which is why this program's own flags are
 * declared normally rather than passed through: a flag before the separator is
 * ours, and everything after it is the child's, including its own `--flags`.
 */

const FAILED = 1;

/** One sentence, and never a stack. */
function said(error: unknown): string {
  return error instanceof Error ? error.message : "something went wrong";
}

function collect(value: string, all: readonly string[]): string[] {
  return [...all, value];
}

const program = new Command();

program
  .name("securesend")
  .description("One secret, one link, one view.")
  .version(manifest.version);

program
  .command("create")
  .description("seal a secret and print its one-time link")
  .option("--text <text>", "the secret, when it is a line of text")
  .option("--file <path>", "attach a file, once per file", collect, [])
  .option("--password", "ask for a password the recipient must also have")
  .addOption(
    new Option("--expiry <preset>", "how long the link lives")
      .choices([...EXPIRIES])
      .default("24h")
  )
  .option("--instance <url>", "the instance to send to")
  .action(async (options: CreateOptions) => {
    process.exitCode = await create(options);
  });

program
  .command("status")
  .description("say what became of a link, without consuming it")
  .argument("<link>")
  .option("--instance <url>", "the instance to ask")
  .action(async (link: string, options: StatusOptions) => {
    process.exitCode = await status(link, options);
  });

program
  .command("reveal")
  .description("consume a link: text to stdout, files to disk")
  .argument("<link>")
  .option("--out <path>", "a directory to write files into, or one file's name")
  .option("--instance <url>", "the instance to ask")
  .action(async (link: string, options: RevealOptions) => {
    process.exitCode = await reveal(link, options);
  });

program
  .command("run")
  .description("consume a link into a command's environment and run it")
  .argument("<link>")
  .argument("<command...>", "the command to run, after --")
  .requiredOption("--as <name>", "the environment variable to put it in")
  .option("--no-reseal", "do not put the secret back when the command fails")
  .option("--instance <url>", "the instance to ask")
  .action(async (link: string, argv: string[], options: RunOptions) => {
    process.exitCode = await run(link, argv, options);
  });

program
  .command("burn")
  .description("destroy a secret early, with the token create printed")
  .argument("<link>")
  .option("--token <managementToken>", "the token create printed")
  .option("--instance <url>", "the instance to ask")
  .action(async (link: string, options: BurnOptions) => {
    process.exitCode = await burn(link, options);
  });

program
  .command("skill")
  .description("print the skill document this binary ships with")
  .action(() => {
    process.exitCode = skill();
  });

try {
  await program.parseAsync();
} catch (error) {
  process.stderr.write(`${said(error)}\n`);
  process.exitCode = FAILED;
}

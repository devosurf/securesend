---
"securesend": minor
"@securesend/api": minor
---

You can send and open secrets from a terminal. `npm install -g securesend` puts one command on your path, and it seals and opens with the exact code the browser runs, imported byte for byte, on Node's own Web Crypto. `securesend create` takes a note from stdin or `--text`, files with `--file`, an optional password it prompts for and never takes as an argument, and prints the link alone on stdout so it pipes. `status` asks without consuming, `reveal` prints text and writes attachments beside you, and `burn` destroys a sealed secret early with the token create handed you.

The verb for agents and scripts is `run`: it opens the secret in-process and hands the plaintext to a child command as an environment variable you name, so it never touches stdout, disk, or a transcript. If the command fails, the plaintext is still in memory, so the CLI re-seals it as a fresh secret with the same password and prints the new link: a failed run does not destroy the secret. `securesend skill` prints a guide written for coding agents, bundled from the same file the repository publishes.

With this release the four routes underneath, create, status, reveal and burn, are public API, documented in docs/api.md and held to the product's semver: the CLI is their first client outside the browser. Everything points at securesend.dev by default and at your own instance with `SECURESEND_URL` or `--instance`.

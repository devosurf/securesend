---
name: securesend
description: Share a secret as a one-time link, or consume one someone sent. Use when a securesend.dev link, or any /s/ link with a #fragment, appears in the conversation; when a password, API key, token, or credential file needs to move between people or machines; when a command needs a secret held behind such a link; or when asked to check or destroy a shared secret.
---

# SecureSend

One secret, one link, one view. The `securesend` CLI seals a secret in the terminal with the same code the browser uses: AES-256-GCM, key generated locally, carried only in the `#fragment` of the link. The server stores ciphertext it cannot read. Honest scope: anyone holding the full link can decrypt, and once a secret is in your context, keeping it out of logs downstream is best effort everywhere. What `run` guarantees is narrower and real: the plaintext goes into a child process's environment without ever entering your transcript.

Install: `npm install -g securesend` (or `npx securesend`). Needs Node 22+.

## Sharing a secret

```
securesend create --text "the secret"          # or pipe: cat key.pem | securesend create
securesend create --file report.pdf --file key.pem
securesend create --password --expiry 1h       # prompts for a password; 1h, 24h or 72h (default 24h)
```

The link is the only line on stdout. Send it over a different channel than the password, if you set one. stderr carries the expiry and a ready-made `securesend burn` command; hand that to the sender, it destroys the secret early if the link goes to the wrong place.

## Consuming a link

A reveal is one-shot: the server hands the ciphertext over exactly once and destroys its copy in the same transaction. So look before you leap:

```
securesend status <link>     # sealed, used, burned or expired; never consumes
```

Then take one of two verbs:

- **A command needs the secret** (env var, credential, token): use `run`. The plaintext never touches stdout or disk.

  ```
  securesend run <link> --as DATABASE_URL -- pnpm db:migrate
  ```

  If the command exits non-zero, the CLI re-seals the plaintext as a fresh secret (new link, same password) and prints the new link on stderr, so a failed run does not destroy the secret. `--no-reseal` opts out.

- **A human or a file needs the secret**: use `reveal`. Text prints to stdout, attachments are written to the working directory (`--out <dir>` to redirect). Only choose this when the plaintext belongs in the transcript or on disk.

Password-protected links prompt on a TTY. Headless, put the password in `SECURESEND_PASSWORD`; the CLI reads it from the environment and never takes it as an argument.

## Rules of the road

- Check `status` before consuming. A link that reads `used` when you expected `sealed` means someone else got there first; treat the secret as exposed and say so.
- Prefer `run` over `reveal`. Reveal-to-stdout puts the plaintext in your transcript; `run` exists so it never gets there.
- Never echo, log, or store a revealed secret beyond its immediate use, and never paste a full link into anything that keeps history you do not control.
- The link fragment is the key. `status` and `burn` work without it; only `reveal` and `run` need the full link.
- Self-hosted instance: set `SECURESEND_URL` to make `create` send there, or pass `--instance` on any command. Links carry their own origin, so consuming needs neither.

## Command reference

```
securesend create              stdin or --text, --file (repeatable), --password (prompt), --expiry 1h|24h|72h
securesend status <link>       state and timestamps; never consumes
securesend reveal <link>       text to stdout, attachments to cwd; --out <dir|file>
securesend run <link> --as NAME -- <command>   inject as $NAME; reseal on failure
securesend burn <link>         destroy early; --token from create's output
securesend skill               print this document
```

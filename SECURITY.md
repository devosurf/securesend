# Security

## Reporting something

**security@securesend.dev.** Encrypted if you like, plain text if you prefer. One
human reads it.

Tell us what you found and how to reproduce it. A rough description beats no
report; we would rather chase a vague lead than not hear about it.

What to expect:

- An acknowledgement within three working days. If you do not get one, the mail
  did not arrive, so try again.
- An honest answer about whether it is a bug, a known weakness, or a design
  decision you disagree with. All three happen and we will say which it is.
- A fix, or a public note about why there is not going to be one.
- Credit in the changelog if you want it, and none if you do not.

There is **no bounty programme**. We are not going to pretend there is a budget
where there is not one. If that makes reporting not worth your time, that is a
fair call and we would rather be honest about it than waste yours.

## What we ask

Good-faith research only, which we will not define exhaustively but does mean:
work against your own secrets, or against a local instance, which takes about a
minute to start (see [self-hosting.md](./docs/self-hosting.md)). Do not run
volumetric tests against the hosted instance, do not try to reach other people's
data, and give us a chance to fix something before publishing it.

We will not threaten you with legal action for research that follows those lines.

## What counts

Reports we want, in rough order of how much we want them:

- Anything that puts a key, a password, or plaintext where it should not be: in a
  request, a log, a URL that gets recorded, the database, an error report.
- Anything that lets a secret be read more than once, or read by somebody without
  the link.
- A way to make the reveal transaction release a payload twice, or release one
  without scrubbing.
- Anything that gets a script from another origin to execute in the page, or
  weakens the content security policy in practice.
- A way to burn or destroy somebody else's secret without their link or their
  management token.
- A claim on any of our pages that is not true. That is a security bug here, not
  a copy bug, because the claims are the product.

## What does not count

Not because they are unwelcome, but so you know before spending an evening:

- **Anyone with the whole link can decrypt the secret.** That is the design, it is
  stated on every page that mentions encryption, and it is the first thing in the
  [threat model](./docs/threat-model.md).
- **A wrong password still spends the link.** There is no server-side verifier, so
  the press consumes the link whether or not the password was right. The page says
  so before the press.
- **There is no limit on password attempts.** We cannot verify a password, so we
  cannot count against you. An honest attempt counter is deliberate; a fake limit
  would be theatre.
- **The rate limiter resets when the process restarts.** In-process memory is
  deliberate: see the reasoning in
  [self-hosting.md](./docs/self-hosting.md#the-rate-limiter-is-in-this-processs-memory).
- **PBKDF2 rather than Argon2id.** Known, reasoned, and written down in the threat
  model. A better argument for changing it is welcome; a report that it is not
  Argon2id is already in the docs.
- **We serve you the JavaScript.** The unavoidable limit of all browser
  cryptography. Also in the threat model, with what we do about it.
- Missing headers that only matter for things this product does not do (no
  cookies, no frames, no forms, no service worker).
- Scanner output with no demonstrated impact.

If you think one of the above is worse than we think it is, that is a report we
want. Make the argument.

## What we are not claiming

No external audit. Not SOC 2 certified. No HIPAA claim. There are no compliance
badges anywhere in this product, and their absence is deliberate rather than an
oversight. When any of that changes it will appear on the security page with the
name of who did it and a date.

## Supported versions

The latest release, and only the latest. There is one version number across the
whole workspace, and no long-term-support branch. If you are self-hosting, `git
pull` and rebuild.

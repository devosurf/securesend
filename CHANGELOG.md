# Changelog

What changed, written as prose about what you experience rather than as a list of
commits. One entry per release, newest first.

The three packages in this workspace share one version number, so a release is one
thing rather than three.

## Unreleased

Nothing has been released yet. v0 is built and not yet cut: the first tag will be
`v1.0.0`, and this section becomes that entry when it is.

What is in the tree today, in the order it arrived:

- The homepage is the create form. Paste a note, optionally add one username and
  password pair, optionally attach files, optionally set a password the recipient
  will need, pick an expiry of 1, 24 or 72 hours, and get one link.
- The two static pages, rendered to HTML at build time, served with the headers
  the security page tells you to check.
- Files ride along inside the envelope, encrypted separately under the same key,
  with their names inside the ciphertext so the instance never learns one.
- A link opens, once. A sealed panel that costs nothing to look at, an explicit
  press that decrypts in your browser and wipes the server's copy in the same
  transaction, honest dead ends for every way a link can be over, and the sender's
  own device quietly remembering what it sent.
- Secrets die on their own, and the instance can say no: expiry destroys
  ciphertext within a minute, tombstones answer for seven days and then go, and
  every route has a pace with an honest refusal when you meet it.
- The self-host story: this changelog, the trust docs, the licence, and a claims
  audit in CI that checks the product's public claims are still true.

The full prose for each of those is in [`.changeset/`](./.changeset) until the
release folds them in.

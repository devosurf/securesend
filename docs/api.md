# The API

Four routes move every secret this product has ever moved. The web app uses them,
the CLI uses them, and from this release they are public: documented here, stable,
and versioned by the product's own semver. A breaking change to any shape on this
page is a major version, and this page changes in the same commit as the code.

The base is `/api` on whatever origin serves the instance, `https://securesend.dev/api`
for the hosted one. There is no authentication and there are no API keys, because
the server holds nothing worth a key: every secret arrives as ciphertext sealed in
the client, and the key that opens it rides the link's `#fragment`, which no HTTP
request carries. What guards each route is stated with it below.

Requests and responses are JSON. Every response carries `Cache-Control: no-store`,
and yours should honour it: these bodies hold ciphertext and one-time tokens.

## What a client must do

The server checks shapes, never plaintext, so the real contract is client-side:

- Encrypt before you send. The reference implementation is
  [`packages/crypto`](../packages/crypto), zero dependencies, Web Crypto only, and
  the same code path the browser and the CLI both run. If you are writing your own
  client, read it first; the envelope format, the AAD binding and the fragment
  token layout are documented in its source.
- Generate the id and the key locally. The id is 16 random bytes as 22 base64url
  characters. The server never generates either.
- Put the key after the `#`. A share link is `<origin>/s/<id>#<fragment token>`,
  and the fragment must never be sent to the server, logged, or given to anything
  that keeps history.

## POST /api/secrets

Stores one sealed envelope. Rate limited per caller and per instance
(`CREATE_PER_HOUR`, defaults 60 per hour with a burst of 10; instance-wide 300/60).

```json
{
  "id": "22 base64url characters, client-generated",
  "expiry": "1h" | "24h" | "72h",
  "envelope": { "ciphertext": "base64url", "iv": "16 base64url chars" },
  "attachments": [ { "ciphertext": "base64url", "iv": "...", "index": 0 } ]
}
```

`attachments` may be omitted. Present, its indexes must be exactly `0..n-1`: each
file's position is cryptographically bound into its ciphertext, so any other set
could never be opened. The whole secret may not exceed 10MB of ciphertext
(`MAX_TOTAL_BYTES`), the envelope part 256KB (`MAX_ENVELOPE_BYTES`), the file
count 10 (`MAX_ATTACHMENTS`).

- `201` `{ "id", "expiresAt", "managementToken" }`. The management token is the
  whole of the sender's authority over this secret, is issued exactly once, and is
  stored only as a hash. Lose it and nothing can burn the secret early.
- `400` `{ "error", "fields" }`, naming the refused fields and quoting nothing.
- `409` `{ "error": "that id is taken" }`. Seal again with a fresh id and key and
  retry; nothing has been shared yet, so this costs nothing.
- `413` `{ "error", "limit"? }` when a part or the whole is too big.
- `429` `{ "error", "retryAfter", "scope": "ip" | "instance" }`, with a
  `Retry-After` header.

## GET /api/secrets/:id

The state of one secret, without touching it. This is the route link previews hit,
so it is the most generously limited (`STATUS_PER_HOUR`, default 600/60) and there
is no code path from it to a write.

- `200`:

```json
{
  "id": "...",
  "state": "sealed" | "used" | "burned" | "expired",
  "createdAt": "ISO 8601",
  "expiresAt": "ISO 8601",
  "usedAt": "ISO 8601 or null",
  "burnedAt": "ISO 8601 or null",
  "burnReason": "sender, or null"
}
```

- `404` `{ "error" }`, the same answer for an unknown id and a malformed one.

`POST /api/secrets/statuses` with `{ "ids": [...] }` (up to 200) answers the same
shape as `{ "secrets": [...] }` for the ids the instance knows. Still a read.

## POST /api/secrets/:id/reveal

The one destructive read. One transaction hands over the ciphertext and scrubs it
before committing, so exactly one caller ever receives it, at any number of
simultaneous attempts. It takes no body at all, and a body is refused: no password
is ever checked here, because a password failure is a local decryption failure in
the client that already holds the ciphertext. Limited per caller
(`REVEAL_PER_HOUR`, default 120/20).

- `200` `{ "id", "envelope": { "ciphertext", "iv" }, "attachments": [...] }`.
- `410` the status object above, when the secret was already used, burned or
  expired. The reveal that answers `410` consumed nothing.
- `404` `{ "error" }`.

## POST /api/secrets/:id/burn

Destroys a sealed secret early. The body is `{ "managementToken": "..." }`, the
token from create.

- `200` the status object, `state: "burned"`. Burning an already-burned secret
  answers `200` again, because the likeliest second press is the panicked one.
- `403` `{ "error" }` when the token does not manage this secret.
- `409` the status object, when the secret died another way first: a burn will not
  claim a secret that was already read or expired.
- `404` `{ "error" }`.

## GET /api/health

`{ "status": "ok" }`, or `503` `{ "status": "unavailable" }` when the database
does not answer. Nothing more, on purpose.

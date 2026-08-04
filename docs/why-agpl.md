# Why AGPLv3

SecureSend is licensed under the [GNU Affero General Public License version
3](../LICENSE). This page is what that means in practice, and why we picked it.

## What it means for you

**Running it, unmodified, for yourself or your team.** Do it. You owe nothing and
you tell nobody. This is the case almost everyone is in.

**Modifying it and keeping the changes to yourself.** Fine too, as long as nobody
else is using it over a network. Change what you like on your own instance.

**Modifying it and letting other people use it over a network.** This is the
clause that makes the AGPL different from the GPL. If you offer your modified
version as a service, you owe your users the modified source. Not to us: to them.
A link in a footer satisfies it.

**Building a paid product on it.** Allowed. Selling hosting for it is allowed, and
so is selling support. What is not allowed is doing that on a modified,
closed-source fork.

**Embedding it in proprietary software.** Not without a separate arrangement.
That is the point of the licence.

We are not going to send you a lawyer's letter for getting an edge case wrong. If
you are unsure whether what you want to do is allowed, ask:
security@securesend.dev reaches a human who will tell you.

## Why this licence and not MIT

The product's entire claim is that you do not have to trust us. That claim is only
worth something if it survives somebody else running the code.

Under MIT, a company could take this, add telemetry, remove the honest caveats from
the security page, close the source, and ship it using every strong word we use and
none of the constraints that make those words true. Their users would have no way to
check any of it, and the words would be doing the same work they do here while
meaning nothing. The AGPL is what stops the checkable version from being forked into
an uncheckable one.

The network clause specifically is the one that matters, because this is a
hosted-service-shaped product. A plain GPL fork could run as a closed service
forever without publishing anything, which is exactly the gap that would let
somebody keep the pitch and drop the substance.

## Why this licence and not a source-available one

We looked at BSL and the various "open but not for competitors" licences and did
not take one.

They would protect a business we do not have yet, at the cost of the one property
the product is built on. A licence with a use restriction is not free software, it
does not get read the same way by a security team, and it makes self-hosting
conditional instead of a right. "Self-hosting stays uncrippled" is a promise in
this repository's [AGENTS.md](../AGENTS.md), and a licence that can be revoked for
competing is not a promise, it is a permission.

The AGPL is a real licence with thirty years of shared understanding behind it. A
bespoke one asks every reader to do legal analysis before they can trust the
product, which is the opposite of the job.

## What is not under the AGPL

The name and the wordmark. Trademark and copyright are different things: the
licence gives you the code, not permission to call your instance SecureSend or use
the mark in a way that suggests we run it. Rename your fork.

## Contributing

By opening a pull request you agree your contribution is licensed under the same
terms. There is no CLA and no copyright assignment. We are not keeping the option
to relicense this later, which is deliberate: an open core with a CLA behind it is
a product that can be closed by a decision nobody outside gets to make.

See [CONTRIBUTING.md](../CONTRIBUTING.md).

## The formal part

Copyright (C) 2026 Liam Vinberg.

This program is free software: you can redistribute it and/or modify it under the
terms of the GNU Affero General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along
with this program. If not, see <https://www.gnu.org/licenses/>.

---
"@securesend/web": minor
---

The integrations page reads `available` on the command line row now, with a page of its own behind it at `/integrations/cli`. It walks the whole errand in the four lines it actually takes: install the command, pipe a file into `securesend create` and get the link back on stdout alone, ask `status` whether the secret is still sealed, and open it with `reveal`. The expiries, and the password that is prompted for rather than passed as an argument, are on the page beside them.

There is a section for the case where the thing needing the secret is a process rather than a person. `securesend run <link> --as NAME -- <command>` puts the plaintext in the child's environment and never in a transcript, and reseals under a fresh link if the command fails, and the page says plainly how narrow that guarantee is: nothing beyond it is claimed, and anyone holding the whole link can still open the secret. `securesend skill` prints the guide an agent can read straight out of the binary.

Pointing the command at your own server is one variable, `SECURESEND_URL`, and opening a link needs nothing at all, because a link carries the origin that sealed it. Only macOS is left on the index reading `planned`, and that paragraph now says so in the singular.

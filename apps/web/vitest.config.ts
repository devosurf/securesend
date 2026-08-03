import { defineConfig } from "vitest/config";

/*
 * There is no component-test layer here on purpose, and the include is what keeps
 * it that way: `.ts` only, so a test of a rendered component has nowhere to live.
 *
 * Two kinds run. The sender's crossing from plaintext to a link, driven at its own
 * boundary with a fake instance on the other side. And the claim the pages make
 * about themselves, which reads the repo, so it keeps the `.node` name the crypto
 * package uses for the same thing. Both are Node: Web Crypto is there either way.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    name: "web",
  },
});

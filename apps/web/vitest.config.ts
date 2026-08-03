import { defineConfig } from "vitest/config";

// There is no component-test layer here on purpose. What runs is the claim the
// pages make about themselves: nothing they load comes from another origin. It
// reads the repo, so it is Node only, like the same kind of test in the crypto
// package.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.node.test.ts"],
    name: "web",
  },
});

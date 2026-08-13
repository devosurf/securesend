import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      /*
       * The mirror of the bundler's text loader. tsup inlines the skill document
       * as a string, and a test that reads the same import has to see the same
       * string, or the one test that proves the two cannot drift is testing
       * something else.
       */
      enforce: "pre",
      name: "markdown-as-text",
      transform(code: string, id: string) {
        return id.endsWith(".md")
          ? { code: `export default ${JSON.stringify(code)};`, map: null }
          : null;
      },
    },
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    name: "cli",
  },
});

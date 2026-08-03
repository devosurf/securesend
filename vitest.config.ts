import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// The crypto package ships to browsers and to Node, so its vectors run in both.
// Tests named *.node.test.ts are the ones that read the repo itself, so they
// only make sense in Node.
export default defineConfig({
  test: {
    projects: [
      "apps/api",
      "apps/web",
      {
        test: {
          environment: "node",
          include: ["src/**/*.test.ts"],
          name: "crypto",
          root: "packages/crypto",
        },
      },
      {
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }],
            provider: playwright(),
          },
          exclude: ["src/**/*.node.test.ts"],
          include: ["src/**/*.test.ts"],
          name: "crypto:browser",
          root: "packages/crypto",
        },
      },
    ],
  },
});

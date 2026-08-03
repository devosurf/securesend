import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// These tests talk to a real Postgres. Take the connection string from the repo
// root .env when there is one, so `pnpm test` works the same locally as in CI,
// where the variable is already in the environment.
const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./vitest.global-setup.ts"],
    include: ["src/**/*.test.ts"],
    name: "api",
  },
});

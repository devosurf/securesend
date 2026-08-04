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
    /*
     * One database, and one row of counters for the whole day, which every test
     * that creates or reveals a secret adds to. Two files running at once would
     * therefore move each other's counts, so this seam is serial: shared mutable
     * state is what these tests are driving, and pretending otherwise only makes
     * them flaky.
     */
    fileParallelism: false,
    globalSetup: ["./vitest.global-setup.ts"],
    include: ["src/**/*.test.ts"],
    name: "api",
    setupFiles: ["./vitest.setup.ts"],
  },
});

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The header check drives the real app, which validates its environment on
// import. Take the connection string from the repo root .env when there is one,
// so this works the same locally as in CI where the variable is already set.
const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

/*
 * The claims audit runs on its own, not as part of `pnpm test`.
 *
 * Half of it reads the documents `pnpm build` wrote, so folding it into the test
 * suite would mean a developer who has not built yet gets a failure about a
 * missing directory instead of the truth about their change. CI runs the suite,
 * then the build, then this.
 *
 * Forks rather than threads: the header check moves the working directory to the
 * api the way the container does, and `process.chdir` is not available inside a
 * worker thread.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["*.test.ts"],
    name: "claims",
    pool: "forks",
    root: import.meta.dirname,
  },
});

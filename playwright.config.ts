import { defineConfig } from "@playwright/test";
import { CONTEXT, INSTANCE } from "./e2e/instance";

/*
 * The last gate, and the only one that runs a browser against the container.
 *
 * Everything else in this repository is tested at a boundary a process can drive:
 * the api fetch-style against a real Postgres, the crypto package as functions,
 * the browser's side of the wire against a fake instance. Three things resist
 * that and they are the whole reason this exists. The key lives in the URL
 * fragment, which only a real address bar has. The clipboard is a permission a
 * real browser grants. A download is a file a real browser writes. So `e2e` is
 * thin on purpose: the three journeys a stranger takes, plus the moves the design
 * fixes, and nothing that a cheaper seam could have proven.
 *
 * The instance is the built image, not a dev server, because the artifact is what
 * ships: the same container a self-hoster pulls, serving the same prerendered
 * documents. compose.smoke.yaml brings it up and this config waits on its health
 * endpoint. One command, `pnpm smoke`.
 */

/** A first build of the image from cold, on a machine that has none of it cached. */
const BUILD_MINUTES = 10;

export default defineConfig({
  forbidOnly: true,
  /* A container is one process with one in-memory rate limiter, and these journeys
   * all create secrets on it. Serially, then: parallel workers would be several
   * senders sharing one caller's allowance, and a gate that trips its own limits is
   * a gate that fails for a reason the product does not have. */
  fullyParallel: false,
  reporter: "list",
  /* Once, for the container rather than for the product: a cold start, a registry
   * hiccup, a port still closing. It hides nothing, because a run that needed the
   * retry is reported as flaky rather than as passed, and a journey that reads flaky
   * has a race in it and should be read as a failure. */
  retries: 1,
  testDir: "e2e",
  /* A journey here is several page loads against a container, a key derivation that
   * is deliberately slow, and a file on and off a disk. The default 30 seconds is a
   * unit test's budget, not this one's. */
  timeout: 90 * 1000,

  /* One source for these, because a recipient arriving in a fresh context has to
   * be the same browser as the sender: see CONTEXT in e2e/instance.ts. */
  use: { ...CONTEXT, trace: "retain-on-failure" },

  webServer: {
    /* In the foreground, so this is one process with a lifetime, and always with
     * `--build`, so the image under test is this working tree rather than whatever
     * was built last. */
    command: "docker compose -f compose.smoke.yaml up --build",
    /* Compose only stops the containers if it is asked rather than killed, and the
     * default here is a kill, which leaves them running. */
    gracefulShutdown: { signal: "SIGTERM", timeout: 30_000 },
    /* Never. An instance already answering on this port is one built from source
     * that may not be this source, and a gate that can silently measure a stale
     * image is not a gate. Playwright says so and stops; the way out is
     * `docker compose -f compose.smoke.yaml down`. */
    reuseExistingServer: false,
    /* The image's logs are the only way to read a failure that happened inside the
     * container rather than in the browser. */
    stdout: "pipe",
    timeout: BUILD_MINUTES * 60 * 1000,
    /* The container's own healthcheck asks the database the same question. */
    url: `${INSTANCE}/api/health`,
  },
  workers: 1,
});

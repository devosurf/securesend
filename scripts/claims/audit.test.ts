import { existsSync } from "node:fs";
import { readdir, readFile, rm, symlink } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LINKS } from "../../apps/web/src/lib/links";
import {
  bannedClaims,
  documentedVariables,
  type Finding,
  inlineCode,
  offOriginInStylesheet,
  offOriginLoads,
  repositoryDestinations,
  type Source,
  strayEnvReaders,
  strayFragmentReaders,
  undocumentedVariables,
  unlabelledClaims,
  variablesRead,
  visibleText,
  withoutComments,
} from "./checks";

/*
 * The claims audit, over what this repository and its build actually contain.
 *
 * It runs after `pnpm build` rather than inside `pnpm test`, because half of it
 * reads the documents the build wrote. `pnpm audit:claims`. It needs DATABASE_URL
 * to be set, because it drives the real api and the api validates its environment
 * on import, but it never queries: the audit passes with the database stopped.
 *
 * Six claims, each one something a page says out loud and invites a reader to go
 * and check:
 *
 *   1 the pages and the stylesheet fetch nothing from another origin, and nothing
 *     the policy would refuse to run is inline
 *   2 no surface makes a claim we are not allowed to make, and neither strong label
 *     appears out of sight of the caveat
 *   3 the url fragment is touched only where it is meant to be
 *   4 the headers ride every class of response, including the built pages
 *   5 .env.example documents every variable the process reads
 *   6 every repository destination the interface links to exists
 *
 * The checks themselves are proven against seeded violations in `checks.test.ts`.
 *
 * One rule throughout: a set of files this reads is asserted non-empty before it is
 * judged. An audit whose glob quietly stopped matching would report an empty list of
 * findings, which reads exactly like a product that stayed honest.
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const WEB_DIST = join(ROOT, "apps/web/dist");

/** The only place the process may read its environment. */
const ENV_MODULE = ["apps/api/src/env.ts"] as const;

/** The three documents the api serves: two prerendered pages and the empty shell. */
const DOCUMENTS = ["index.html", "security.html", "shell.html"] as const;

/** A secret link, key and all, in a file the build wrote. */
const BAKED_FRAGMENT = /\/s\/[\w-]+#/;
/** The document's own script, which is the asset every page needs to boot. */
const DOCUMENT_SCRIPT = /<script[^>]+src="([^"]+)"/;

function report(findings: readonly Finding[]): string[] {
  return findings.map(({ where, what }) => `${where}: ${what}`);
}

/**
 * Every file under a directory that the filter keeps, read.
 *
 * Throws on an empty result rather than returning one. A glob that stops matching is
 * the way this audit would fail open, and the caller cannot tell an honest empty set
 * from a broken one, so it is refused here where the directory is still in hand.
 */
async function sources(
  directory: string,
  keep: (path: string) => boolean
): Promise<Source[]> {
  const base = join(ROOT, directory);
  const entries = await readdir(base, { recursive: true, withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => keep(relative(ROOT, path)));

  if (paths.length === 0) {
    throw new Error(`${directory} matched no files, so nothing was checked`);
  }

  return await Promise.all(
    paths.map(async (path) => ({
      path: relative(ROOT, path),
      text: await readFile(path, "utf8"),
    }))
  );
}

/** Named files, read. Same refusal as above: a missing one is not an empty one. */
async function files(...paths: readonly string[]): Promise<Source[]> {
  return await Promise.all(
    paths.map(async (path) => ({
      path,
      text: await readFile(join(ROOT, path), "utf8"),
    }))
  );
}

const isCode = (path: string) =>
  (path.endsWith(".ts") || path.endsWith(".tsx")) && !path.includes(".test.");

const isMarkdown = (path: string) => path.endsWith(".md");

/** Every markdown surface a reader arrives on, wherever it lives. */
async function everyDocument(): Promise<Source[]> {
  return [
    ...(await sources("docs", isMarkdown)),
    ...(await sources(".changeset", isMarkdown)),
    ...(await files(
      "README.md",
      "AGENTS.md",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "CHANGELOG.md"
    )),
  ];
}

let documents: Source[] = [];
let stylesheets: Source[] = [];

beforeAll(async () => {
  if (!existsSync(WEB_DIST)) {
    throw new Error("apps/web/dist is missing. Run pnpm build first.");
  }

  documents = await files(...DOCUMENTS.map((file) => `apps/web/dist/${file}`));
  stylesheets = await sources("apps/web/dist/assets", (path) =>
    path.endsWith(".css")
  );
});

describe("what the pages load", () => {
  it("fetches nothing from another origin", () => {
    const findings = documents.flatMap(({ path, text }) =>
      offOriginLoads(path, text)
    );

    expect(report(findings)).toEqual([]);
  });

  it("fetches nothing from another origin in a stylesheet either", () => {
    /* Where this would arrive without anybody deciding to: a dependency's CSS
     * naming a hosted font. The bundle that ships is the artifact the claim is
     * about, so it is the one read here. */
    expect(stylesheets.length).toBeGreaterThan(0);

    const findings = stylesheets.flatMap(({ path, text }) =>
      offOriginInStylesheet(path, text)
    );

    expect(report(findings)).toEqual([]);
  });

  it("runs nothing inline", () => {
    // The policy is self with no unsafe-inline, so anything inline here would be
    // silently dropped in production, which is the worst way for a page to break.
    const findings = documents.flatMap(({ path, text }) =>
      inlineCode(path, text)
    );

    expect(report(findings)).toEqual([]);
  });
});

describe("what the surfaces claim", () => {
  it("makes no claim we are not allowed to make, on any page", () => {
    const findings = documents.flatMap(({ path, text }) =>
      bannedClaims(path, visibleText(text))
    );

    expect(report(findings)).toEqual([]);
  });

  it("makes no claim we are not allowed to make, in any document", async () => {
    const findings = (await everyDocument()).flatMap(({ path, text }) =>
      bannedClaims(path, text)
    );

    expect(report(findings)).toEqual([]);
  });

  it("keeps both strong labels within sight of the caveat, on any page", () => {
    /* The claims rule stated most precisely: zero-knowledge and end-to-end are both
     * true here in a specific sense and read as a much bigger promise, so the
     * caveat is what makes either honest. */
    const findings = documents.flatMap(({ path, text }) =>
      unlabelledClaims(path, visibleText(text))
    );

    expect(report(findings)).toEqual([]);
  });

  it("keeps both strong labels within sight of the caveat, in any document", async () => {
    const findings = (await everyDocument()).flatMap(({ path, text }) =>
      unlabelledClaims(path, text)
    );

    expect(report(findings)).toEqual([]);
  });

  it("makes no claim we are not allowed to make, in the copy that never prerenders", async () => {
    /* The recipient's whole side is client-rendered, so its dead ends and its
     * sealed panel are not in any document the build wrote. Their words are still
     * words a reader is shown, and this is the only place to check them. */
    const code = await sources("apps/web/src", isCode);
    const findings = code.flatMap(({ path, text }) =>
      bannedClaims(path, withoutComments(text))
    );

    expect(report(findings)).toEqual([]);
  });
});

describe("the url fragment", () => {
  it("is touched only where it is meant to be", async () => {
    /* Two places, both named in FRAGMENT_SITES: the one that reads a key and
     * scrubs it from the address bar, and the one that cuts a key out of a link so
     * the sender's history cannot carry it. A third fails here. */
    const code = await sources("apps/web/src", isCode);

    expect(report(strayFragmentReaders(code))).toEqual([]);
  });

  it("is not in any document the build wrote", () => {
    // A prerendered page carrying a fragment would mean a real key had been baked
    // into a file. Nothing can put one there today; this is here so nothing can.
    for (const { path, text } of documents) {
      expect(text, `${path} carries a fragment`).not.toMatch(BAKED_FRAGMENT);
    }
  });
});

/*
 * The headers, on the running app, with the web build where the container puts it.
 *
 * The api's own header tests cover every route class, but they run with no build
 * present, so a page route is a 404 there and the static path is exercised through
 * a stand-in. This is the other half: the real documents, off disk, through the
 * branch production actually takes. Together they are the whole claim.
 */
describe("the headers on a built instance", () => {
  const PUBLIC = join(ROOT, "apps/api/public");
  let staged = false;
  let request: (path: string) => Promise<Response>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    if (!existsSync(PUBLIC)) {
      await symlink(WEB_DIST, PUBLIC, "dir");
      staged = true;
    }

    /* The app resolves its static root against the working directory, the way it
     * does in the container, and it decides whether there is a build to serve when
     * the module first loads. So both have to be true before the import. */
    process.chdir(join(ROOT, "apps/api"));

    const [{ app }, { closeDatabase }] = await Promise.all([
      import("../../apps/api/src/app"),
      import("../../apps/api/src/db/client"),
    ]);

    request = async (path: string) => await app.request(path);
    close = closeDatabase;
  });

  afterAll(async () => {
    await close?.();

    if (staged) {
      await rm(PUBLIC, { force: true, recursive: true });
    }
  });

  it.each(["/", "/security"])(
    "serves %s with its words in it",
    async (path) => {
      const response = await request(path);

      expect(response.status).toBe(200);
      /* "View source and count" has to mean something, and it cannot if the body
       * arrives as a script tag. An empty root would be the shell being served here
       * instead of the page the build rendered. */
      expect(await response.text()).not.toContain('<div id="root"></div>');
    }
  );

  it.each(["/", "/security", "/s/7hK2mQ", "/api/secrets/7hK2mQ"])(
    "locks down %s",
    async (path) => {
      const policy = (await request(path)).headers.get(
        "content-security-policy"
      );

      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("script-src 'self'");
      expect(policy).toContain("style-src 'self'");
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).not.toContain("unsafe-inline");
      expect(policy).not.toContain("unsafe-eval");
    }
  );

  it.each(["/", "/security", "/s/7hK2mQ", "/api/secrets/7hK2mQ"])(
    "sends no referrer and no cookie from %s",
    async (path) => {
      const response = await request(path);

      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  );

  it("keeps a secret's address out of search", async () => {
    const response = await request("/s/7hK2mQ");

    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    // The header can be stripped by something in between, so the shell says it too.
    expect(await response.text()).toContain('content="noindex"');
  });

  it("lets nothing the api says be cached", async () => {
    const response = await request("/api/secrets/7hK2mQ");

    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("serves the built assets from this origin", async () => {
    const document = await (await request("/")).text();
    const asset = DOCUMENT_SCRIPT.exec(document)?.[1];

    if (asset === undefined) {
      throw new Error("the homepage names no script to load");
    }

    const response = await request(asset);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'self'"
    );
  });
});

describe("the example environment file", () => {
  it("documents every variable the process reads", async () => {
    // A pair rather than `files`, so both are strings to the typechecker.
    const [example, module] = await Promise.all([
      readFile(join(ROOT, ".env.example"), "utf8"),
      readFile(join(ROOT, ENV_MODULE[0]), "utf8"),
    ]);
    const read = variablesRead(module);

    expect(read.length, `${ENV_MODULE[0]} reads nothing`).toBeGreaterThan(0);
    expect(
      report(undocumentedVariables(read, documentedVariables(example)))
    ).toEqual([]);
  });

  it("is the only place the process reads its environment", async () => {
    const code = [
      ...(await sources("apps/api/src", isCode)),
      ...(await sources("apps/web/src", isCode)),
    ];

    expect(report(strayEnvReaders(code, ENV_MODULE))).toEqual([]);
  });
});

describe("where the interface sends a reader", () => {
  it("points at files that exist", () => {
    const destinations = repositoryDestinations(Object.values(LINKS));

    expect(
      destinations.length,
      "no repository destinations found"
    ).toBeGreaterThan(0);

    for (const path of destinations) {
      expect(existsSync(join(ROOT, path)), `${path} does not exist`).toBe(true);
    }
  });
});

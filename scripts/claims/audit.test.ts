import { existsSync } from "node:fs";
import { readdir, readFile, rm, symlink } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LINKS } from "../../apps/web/src/lib/links";
import {
  bannedClaims,
  cardCopy,
  describedAs,
  documentedVariables,
  type Finding,
  inlineCode,
  navFindings,
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
 * Seven claims, each one something a page says out loud and invites a reader to go
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
 *   7 every page meant to be found wears the same nav, and none of them links to
 *     the page it is on
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

/**
 * Every page meant to be found: the file the build wrote, the address it answers
 * on, and which nav item it is.
 *
 * One table rather than three lists, because a page added to one of them and
 * forgotten in the others is a page half of this audit stops reading, and the
 * half that stopped is the half that reports nothing wrong.
 */
const PAGES = [
  { at: "/", file: "index.html", here: null },
  { at: "/security", file: "security.html", here: "Security" },
  { at: "/integrations", file: "integrations.html", here: "Integrations" },
  {
    at: "/integrations/slack",
    file: "integrations-slack.html",
    /* A detail page under Integrations, so it is that nav item's page too: the
     * nav is about where a reader is, and they are inside Integrations. */
    here: "Integrations",
  },
  {
    at: "/integrations/cli",
    file: "integrations-cli.html",
    here: "Integrations",
  },
] as const;

/** Every document the api serves: the pages meant to be found, and the shell. */
const DOCUMENTS: readonly string[] = [
  ...PAGES.map(({ file }) => file),
  "shell.html",
];

/** The addresses those pages answer on, for the checks that make a request. */
const FINDABLE = PAGES.map(({ at }) => at);

/** A secret link, key and all, in a file the build wrote. */
const BAKED_FRAGMENT = /\/s\/[\w-]+#/;
/** The document's own script, which is the asset every page needs to boot. */
const DOCUMENT_SCRIPT = /<script[^>]+src="([^"]+)"/;

/*
 * A card's image and a page's canonical link, once this process has named itself
 * in them.
 *
 * Both are written by the build as a placeholder, because the container that ships
 * is the same one a self-hoster runs and it cannot know what it will be called.
 * These match the shape of the result rather than the spelling of the placeholder,
 * so a rename on either side of that contract fails here rather than shipping
 * cards that point at an address which does not resolve.
 */
const CARD_IMAGE =
  /<meta content="https?:\/\/[^"]+\/og\.png" property="og:image">/;
const SECRET_CARD_IMAGE =
  /<meta content="https?:\/\/[^"]+\/og-secret\.png" property="og:image">/;
const CANONICAL = /<link href="https?:\/\/[^"]+" rel="canonical">/;

/** What a sitemap entry points at, with this instance's own address taken off. */
const SITEMAP_LOC = /<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g;
/** The line that hands a crawler the sitemap, absolute as that line has to be. */
const SITEMAP_LINE = /^Sitemap: https?:\/\/\S+\/sitemap\.xml$/m;
const AN_IMAGE = /^image\//;

const NOT_FOUND = 404;

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

  /*
   * The copy nobody browsing this repository would think to read, and the reason
   * it is here: everything else the claims rule guards is a page or a document,
   * but the Slack integration says things to a person inside somebody else's chat
   * app. Those sentences live in api source and in a manifest, they are never
   * rendered into any document this audit already sweeps, and they are the ones a
   * reader is least able to check for themselves.
   */
  it("makes no claim we are not allowed to make, where slack does the talking", async () => {
    const spoken = [
      ...(await sources("apps/api/src/slack", isCode)),
      ...(await files("docs/slack-app-manifest.json")),
    ];

    expect(spoken.length, "the slack surface reads as empty").toBeGreaterThan(
      0
    );
    expect(
      report(spoken.flatMap(({ path, text }) => bannedClaims(path, text)))
    ).toEqual([]);
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

  it("makes no claim we are not allowed to make, in what a page says about itself", () => {
    /* The description is the one line of copy a reader never sees on the page and a
     * search result quotes back whole. It rides in an attribute, so visibleText drops
     * it, and it is written by the build rather than by a route, so it is outside every
     * directory the checks above read as source. Both halves of the rule apply to it.
     *
     * Every document, the shell included. It is noindex, so its description is
     * not there for a search result, but a chat client falls back to reading it. */
    const described = documents.flatMap(({ path, text }) =>
      describedAs(text).map((said) => ({ path, said }))
    );

    expect(
      described.length,
      "a document describes itself twice or not at all"
    ).toBe(DOCUMENTS.length);

    const findings = described.flatMap(({ path, said }) => [
      ...bannedClaims(path, said),
      ...unlabelledClaims(path, said),
    ]);

    expect(report(findings)).toEqual([]);
  });

  it("makes no claim we are not allowed to make, on a share card", () => {
    /* A card is the description one step further out: it is read in somebody else's
     * chat window by a person who has not arrived yet, which for most recipients makes
     * it the first sentence of this product they ever see. Every word of it is a line
     * one of these pages already says, and the rule binds it either way. */
    const said = documents.flatMap(({ path, text }) =>
      cardCopy(text).map((copy) => ({ copy, path }))
    );

    /* A headline, a summary and an image description on each document. An empty
     * list here would mean the head quietly stopped being written, which is how this
     * would break without anybody noticing: a card nobody drew is a link that looks
     * wrong in a chat window, not a build that fails. */
    expect(said.length, "no document carries a card").toBe(
      DOCUMENTS.length * 3
    );

    const findings = said.flatMap(({ copy, path }) => [
      ...bannedClaims(path, copy),
      ...unlabelledClaims(path, copy),
    ]);

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
 * The running app, with the web build where the container puts it.
 *
 * The api's own tests cover every route class, but they run with no build present,
 * so a page route is a 404 there and the static path is exercised through a
 * stand-in. This is the other half: the real documents, off disk, through the
 * branch production actually takes. Together they are the whole claim.
 *
 * Two things are checked here rather than off the build. The headers, because a
 * header only exists on a response. And what the documents say once they have been
 * served, because the address in a share card is the one thing the build cannot
 * know and this process fills in.
 */
describe("a built instance", () => {
  const PUBLIC = join(ROOT, "apps/api/public");
  let staged = false;
  let request: (path: string, init?: RequestInit) => Promise<Response>;
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

    request = async (path: string, init?: RequestInit) =>
      await app.request(path, init);
    close = closeDatabase;
  });

  afterAll(async () => {
    await close?.();

    if (staged) {
      await rm(PUBLIC, { force: true, recursive: true });
    }
  });

  it.each(FINDABLE)("serves %s with its words in it", async (path) => {
    const response = await request(path);

    expect(response.status).toBe(200);
    /* "View source and count" has to mean something, and it cannot if the body
     * arrives as a script tag. An empty root would be the shell being served here
     * instead of the page the build rendered. */
    expect(await response.text()).not.toContain('<div id="root"></div>');
  });

  it.each([...FINDABLE, "/s/7hK2mQ", "/api/secrets/7hK2mQ"])(
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

  it.each([...FINDABLE, "/s/7hK2mQ", "/api/secrets/7hK2mQ"])(
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

  /*
   * The instance compresses what it serves, which is a claim the changelog makes and
   * the one thing here a reader would notice going wrong rather than read about.
   *
   * It is checked on the real documents because they are the only responses this
   * process makes that are big enough for it to apply to: Hono leaves anything under
   * a kilobyte alone, so every route the api's own tests reach is skipped by design.
   * And the bytes are decompressed rather than the header trusted, because a header
   * naming an encoding that is not there is worse than no header.
   */
  it("compresses what it serves", async () => {
    const response = await request("/", {
      headers: { "accept-encoding": "gzip" },
    });
    const { body } = response;

    expect(response.headers.get("content-encoding")).toBe("gzip");
    if (!body) {
      throw new Error("the homepage came back with no body");
    }

    const unpacked = await new Response(
      body.pipeThrough(new DecompressionStream("gzip"))
    ).text();

    expect(unpacked).toContain("Send a secret");
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

  /* What a chat window gets when somebody pastes one of these links. The
   * substitution is the thing under test: the build leaves a placeholder where an
   * absolute address belongs and this process is what fills it in. */
  it.each(FINDABLE)("names itself in the card for %s", async (path) => {
    const document = await (await request(path)).text();

    expect(document).toMatch(CARD_IMAGE);
    expect(document).toMatch(CANONICAL);
  });

  it("gives a secret's address a card and no canonical address", async () => {
    const document = await (await request("/s/7hK2mQ")).text();

    expect(document).toContain(
      '<meta content="Someone sent you a secret." property="og:title">'
    );
    expect(document).toMatch(SECRET_CARD_IMAGE);

    /* One file is served for every secret there is, so there is no address it
     * could name that would be true of more than one of them. A canonical link is
     * a page asking to be filed under an address, and this page asks the opposite:
     * the noindex two tests up is the whole of what it says about itself. */
    expect(document).not.toContain('rel="canonical"');
    expect(document).not.toContain("og:url");
  });

  it.each(["/og.png", "/og-secret.png", "/icon-96.png"])(
    "serves %s",
    async (path) => {
      const response = await request(path);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
    }
  );

  it("serves an icon at the address a browser asks for before it reads anything", async () => {
    /* Every browser requests /favicon.ico off the root whatever the head says, and
     * so does the crawler that puts an icon beside a search result. This used to
     * answer 200 with the shell's markup, which is how the site spent its first
     * week in Google wearing a generic globe. */
    const response = await request("/favicon.ico");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(AN_IMAGE);
  });

  /*
   * A file this instance does not have is a 404, not a page.
   *
   * The rule is worth a test because the failure is silent and expensive: a 200 is
   * a promise, and everything downstream believes it. A CDN caches markup under an
   * image's address, a crawler files a page as an icon, and nothing anywhere logs
   * a problem. Three separate symptoms traced back to this one answer.
   */
  it.each(["/nothing-here.png", "/sitemap.xsl", "/apple-touch-icon.png"])(
    "404s %s rather than answering with a page",
    async (path) => {
      const response = await request(path);

      expect(response.status).toBe(NOT_FOUND);
      expect(response.headers.get("content-type")).not.toContain("text/html");
    }
  );

  it("still gives an unknown route the shell, because that is a route", async () => {
    // The rule keys on a file extension, and it has to: a secret's address has no
    // dot in it, and neither does anything else the client routes.
    const response = await request("/s/7hK2mQ");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  it("names this instance in robots.txt and still keeps secrets out", async () => {
    const response = await request("/robots.txt");
    const robots = await response.text();

    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(robots).toMatch(SITEMAP_LINE);
    expect(robots).toContain("Disallow: /s/");
  });

  it("lists every findable page in the sitemap and no secret", async () => {
    const response = await request("/sitemap.xml");
    const map = await response.text();

    expect(response.headers.get("content-type")).toContain("application/xml");
    expect([...map.matchAll(SITEMAP_LOC)].map(([, at]) => at)).toEqual([
      ...FINDABLE,
    ]);
    /* A sitemap is an invitation to crawl every address in it, so a secret's
     * address appearing here would undo the header, the document and robots.txt
     * in one line. Nothing can put one there today; this is here so nothing can. */
    expect(map).not.toContain("/s/");
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

describe("the nav on every page meant to be found", () => {
  /*
   * Each of these pages is rendered on its own in the build's second pass, so
   * nothing else in the build would notice one of them wearing a different set of
   * destinations, or a different order, or offering a press that goes nowhere
   * because it points at the page it is already on. A reader moving between them
   * would notice all three.
   */
  it.each(PAGES)(
    "carries the three destinations on $file",
    ({ file, here }) => {
      const page = documents.find(({ path }) => path.endsWith(`/${file}`));

      if (!page) {
        throw new Error(`${file} was not read`);
      }

      expect(report(navFindings(file, page.text, here))).toEqual([]);
    }
  );
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

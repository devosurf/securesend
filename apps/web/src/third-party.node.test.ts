import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * Zero third-party requests is a claim the security page makes out loud and
 * invites a reader to check, so it is checked here instead of being remembered.
 *
 * The page points at GitHub and at two mail addresses, and those are fine: a link
 * is somewhere a reader chooses to go, not something the page fetches. What must
 * never appear is a fetch: a stylesheet, a font, a script or an image loaded from
 * anywhere but this origin. So the rule is about what the browser goes and gets,
 * which in this app means CSS `url()`, CSS `@import`, and the document's own
 * script and stylesheet tags.
 *
 * The second half is about the policy rather than the requests. The server sends
 * `style-src 'self'` with no `unsafe-inline`, which blocks inline style
 * attributes as well as inline style elements. Every dynamic value in the
 * interface is therefore a class, and this is what keeps it that way: a `style`
 * prop added in good faith would be silently dropped in production, which is the
 * worst kind of breakage.
 */

const WEB = fileURLToPath(new URL("../", import.meta.url));

const OFF_ORIGIN = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

/** `url(...)` targets, quoted or bare. */
const CSS_URL = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
/** `@import "x"` and `@import url("x")`. */
const CSS_IMPORT = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g;
/** `src="x"` and `href="x"` on a tag in the document. */
const HTML_SOURCE = /(?:src|href)="([^"]+)"/g;
/** A JSX style prop, which is what the policy will not run. */
const STYLE_PROP = /\sstyle=\{/;

function targets(source: string, pattern: RegExp) {
  return [...source.matchAll(pattern)].map(([, target]) => target ?? "");
}

async function sources(extension: string) {
  const entries = await readdir(join(WEB, "src"), { recursive: true });
  const paths = entries
    .filter((entry) => entry.endsWith(extension))
    .map((entry) => join(WEB, "src", entry));

  return await Promise.all(
    paths.map(async (path) => ({ path, text: await readFile(path, "utf8") }))
  );
}

describe("what the pages load", () => {
  it("fetches its styles and fonts from this origin only", async () => {
    const styles = await sources(".css");
    expect(styles.length).toBeGreaterThan(0);

    for (const { path, text } of styles) {
      for (const target of [
        ...targets(text, CSS_URL),
        ...targets(text, CSS_IMPORT),
      ]) {
        expect(OFF_ORIGIN.test(target), `${path} loads ${target}`).toBe(false);
      }
    }
  });

  it("loads its script and stylesheet from this origin only", async () => {
    const html = await readFile(join(WEB, "index.html"), "utf8");

    for (const target of targets(html, HTML_SOURCE)) {
      expect(OFF_ORIGIN.test(target), `index.html loads ${target}`).toBe(false);
    }
  });

  it("ships every font file it names", async () => {
    const fonts = await readFile(join(WEB, "src/styles/fonts.css"), "utf8");
    const named = targets(fonts, CSS_URL);

    expect(named.length).toBeGreaterThan(0);

    await Promise.all(
      named.map((target) => access(join(WEB, "public", target)))
    );
  });
});

describe("what the content security policy allows", () => {
  it("carries no inline style attribute anywhere in the interface", async () => {
    const components = [...(await sources(".tsx")), ...(await sources(".ts"))];

    for (const { path, text } of components) {
      expect(STYLE_PROP.test(text), `${path} sets an inline style`).toBe(false);
    }
  });
});

import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { build, defineConfig, type Plugin } from "vite";
// Named with its extension, unlike every other import in this repository: Vite's
// coming native config loader resolves a config's imports as real paths rather
// than bundling them, and a real path has an extension.
import {
  altOf,
  BACKGROUND,
  CARD,
  ORIGIN,
  SURFACES,
  type Surface,
} from "./social.ts";

const API_PORT = 3000;

/*
 * What each document says about itself lives in social.ts, next door.
 *
 * It is build output: the running app never changes it, and a static page that
 * has to boot JavaScript to name itself is not really static. It sits in its own
 * file rather than here because the script that draws the share images reads the
 * same table, and copy that two things quote had better have one home.
 *
 * Four documents come out of that table. Three are the pages meant to be found,
 * rendered to markup. The last is the shell every client-rendered route gets:
 * the same assets with an empty root. A secret route must not be served the
 * homepage's markup, both because a flash of "Send a secret" is the wrong thing
 * to show somebody opening a link and because hydration would have to throw it
 * away.
 */

const SSR_OUT = "dist-ssr";
const ROOT_DIV = '<div id="root"></div>';
const TITLE = /<title>[^<]*<\/title>/;
const HEAD_END = "</head>";

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function titled(template: string, title: string) {
  return template.replace(TITLE, `<title>${escapeAttribute(title)}</title>`);
}

/** More tags in the head, indented the way the template's own tags are. */
function inHead(template: string, tags: readonly string[]) {
  const written = tags.map((tag) => `  ${tag}\n`).join("");

  return template.replace(HEAD_END, `${written}  ${HEAD_END}`);
}

function meta(name: string, content: string) {
  return `<meta content="${escapeAttribute(content)}" name="${name}">`;
}

/** The Open Graph tags say `property` rather than `name`, which is that protocol's
 * own spelling and what every reader of them looks for. */
function property(name: string, content: string) {
  return `<meta content="${escapeAttribute(content)}" property="${name}">`;
}

/**
 * What a chat window, and a search result, are told about this document.
 *
 * The absolute addresses are written as a placeholder rather than as this
 * project's domain. og:image has to be absolute to be fetched at all, and a
 * self-hoster's instance must name itself: baking securesend.dev into the
 * container everybody gets would put our address on their cards and send their
 * recipients' clients to our server for the picture. apps/api/src/app.ts fills it
 * in from the request as it serves the document.
 */
function head(surface: Surface): string[] {
  const { card, description, headline, path, summary } = surface;

  const shared = [
    meta("description", description),
    meta("theme-color", BACKGROUND),
    property("og:site_name", "SecureSend"),
    property("og:type", "website"),
    property("og:title", headline),
    property("og:description", summary),
    property("og:image", `${ORIGIN}/${card.file}`),
    property("og:image:width", String(CARD.width)),
    property("og:image:height", String(CARD.height)),
    property("og:image:alt", altOf(card)),
    /* Everything else Twitter reads off the og tags. This one has no og
     * equivalent, and it is what asks for the wide card rather than a thumbnail
     * beside the text. */
    meta("twitter:card", "summary_large_image"),
  ];

  if (path === null) {
    /*
     * The shell, which is a secret's address.
     *
     * The header says noindex too. Saying it in the document as well means a proxy
     * that strips headers cannot quietly put a secret's address in an index.
     *
     * And no canonical address, because it has none: this one file is served for
     * every secret there is, so any address written here would be a lie about all
     * but one of them. Which is the right answer anyway. A canonical link is a
     * page asking to be filed under an address, and this page is asking the
     * opposite.
     */
    return [...shared, meta("robots", "noindex")];
  }

  const canonical = `${ORIGIN}${path}`;

  return [
    ...shared,
    property("og:url", canonical),
    `<link href="${canonical}" rel="canonical">`,
  ];
}

/**
 * The pages meant to be found, listed for a crawler.
 *
 * No `lastmod` on any entry. It is the field a generator reaches for and the
 * one it is most likely to lie about: the honest value is when the words on the
 * page last changed, which a build that reruns on every deploy does not know. A
 * missing field costs nothing, and a wrong one teaches a crawler to ignore the
 * file.
 */
function sitemap(): string {
  const entries = SURFACES.filter(({ path }) => path !== null)
    .map(({ path }) => `  <url><loc>${ORIGIN}${path}</loc></url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

/** One document: its title, its head, and its body if it has one. */
function document(template: string, surface: Surface, markup: string) {
  const named = inHead(titled(template, surface.title), head(surface));

  return markup === ""
    ? named
    : named.replace(ROOT_DIV, `<div id="root">${markup}</div>`);
}

/**
 * Renders the static pages to HTML after the client build, in a second pass that
 * builds the app for Node and throws that bundle away again.
 */
function prerender(): Plugin {
  let root = "";
  let outDir = "dist";
  let intoNode = false;

  return {
    apply: "build",

    async closeBundle() {
      if (intoNode) {
        return;
      }

      // Always, even when a render throws: a half-finished second pass must not
      // leave a bundle behind for somebody to commit.
      try {
        await build({
          build: {
            emptyOutDir: true,
            outDir: SSR_OUT,
            ssr: "src/prerender.tsx",
          },
          logLevel: "warn",
        });

        const entry = pathToFileURL(
          resolve(root, SSR_OUT, "prerender.js")
        ).href;
        const { render } = (await import(entry)) as {
          render: (path: string) => Promise<string>;
        };

        const dist = resolve(root, outDir);
        const template = await readFile(resolve(dist, "index.html"), "utf8");

        await Promise.all(
          SURFACES.map(async (surface) => {
            // The shell renders nothing: its root stays empty and the client
            // fills it, because the key is in the fragment and nothing about
            // that page can be decided anywhere but in the browser holding it.
            const markup =
              surface.path === null ? "" : await render(surface.path);

            await writeFile(
              resolve(dist, surface.file),
              document(template, surface, markup)
            );
          })
        );

        await writeFile(resolve(dist, "sitemap.xml"), sitemap());
      } finally {
        await rm(resolve(root, SSR_OUT), { force: true, recursive: true });
      }
    },

    configResolved({ root: configRoot, build: { outDir: configOutDir, ssr } }) {
      root = configRoot;
      outDir = configOutDir;
      // The second pass loads this same config, so this is what stops it
      // starting a third.
      intoNode = Boolean(ssr);
    },
    name: "securesend:prerender",
  };
}

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react" }),
    react(),
    tailwindcss(),
    prerender(),
  ],
  server: {
    // Production serves the SPA and /api from one origin. The proxy keeps
    // development on one origin too, so no CORS anywhere.
    proxy: {
      "/api": `http://localhost:${API_PORT}`,
    },
  },
});

import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { build, defineConfig, type Plugin } from "vite";

const API_PORT = 3000;

/*
 * The two pages that are prerendered, and what each one is called.
 *
 * The title and the description live here rather than in the route file because
 * they are build output: the running app never changes them, and a static page
 * that has to boot JavaScript to name itself is not really static. Both are the
 * page's own words, verbatim: the title is its heading, the description is the
 * heading and the sentence under it. Nothing here invents copy: what a page says
 * about itself is the design's to decide, not the build's.
 *
 * Only these two carry a description, because only these two are meant to be
 * found. Every other route is a secret's address and says noindex instead.
 */
interface Page {
  description: string;
  file: string;
  /** The route to render. */
  path: string;
  title: string;
}

const PAGES: readonly Page[] = [
  {
    description:
      "Send a secret that disappears. Type it, paste it, or drop a file in. It's locked in this browser before it goes anywhere.",
    file: "index.html",
    path: "/",
    title: "SecureSend",
  },
  {
    description:
      "How this actually works: the mechanism, the limits, and the things we are not claiming. Written to be checked against the source rather than believed.",
    file: "security.html",
    path: "/security",
    title: "How this actually works",
  },
];

/* Every other route is client-rendered, and it gets this: the same assets with an
 * empty root. A secret route must not be served the homepage's markup, both
 * because a flash of "Send a secret" is the wrong thing to show somebody opening a
 * link and because hydration would have to throw it away. */
const SHELL = "shell.html";

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

/** One more tag in the head, indented the way the template's own tags are. */
function inHead(template: string, tag: string) {
  return template.replace(HEAD_END, `  ${tag}\n  ${HEAD_END}`);
}

function page(template: string, spec: Page, markup: string) {
  return inHead(
    titled(template, spec.title),
    `<meta content="${escapeAttribute(spec.description)}" name="description">`
  ).replace(ROOT_DIV, `<div id="root">${markup}</div>`);
}

function shell(template: string) {
  // The header says noindex too. Saying it in the document as well means a proxy
  // that strips headers cannot quietly put a secret's address in an index.
  return inHead(template, '<meta content="noindex" name="robots">');
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
          PAGES.map(async (spec) => {
            const markup = await render(spec.path);
            await writeFile(
              resolve(dist, spec.file),
              page(template, spec, markup)
            );
          })
        );
        await writeFile(resolve(dist, SHELL), shell(template));
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

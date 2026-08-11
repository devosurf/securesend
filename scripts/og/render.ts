import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { CARD, CARDS, type Card } from "../../apps/web/social.ts";

/*
 * The two share images, drawn from the product's own tokens and font files.
 *
 * `pnpm og`. The output is committed, because it is an asset the instance serves
 * rather than something the build makes: putting a browser in the build path to
 * redraw two static pictures on every deploy would be a strange price for a file
 * that changes when the design does and never otherwise.
 *
 * Drawn here rather than exported from a design tool for the reason the fonts are
 * self-hosted: the values are already written down. The colours are the tokens,
 * the faces are the woff2 files the app serves, and the mark is the path
 * src/ui/wordmark.tsx draws. So the cards cannot quietly stop matching the
 * product, and moving a token moves them on the next run.
 *
 * Sizes are the card's own. Faces, weights and tracking are the page's, but a
 * chat window renders this at about a third of its width, so type set at the
 * interface's own sizes would arrive at eight or nine pixels. What is quoted here
 * is the voice, not the measurements.
 */

const FONTS = fileURLToPath(
  new URL("../../apps/web/public/fonts/", import.meta.url)
);
const OUT = fileURLToPath(new URL("../../apps/web/public/", import.meta.url));

/* The latin subsets only. Everything either card says is ASCII, and the ext files
 * would double the bytes read for nothing. */
const FACES = {
  display: {
    file: "bricolage-grotesque-latin.woff2",
    name: "Bricolage Grotesque",
  },
  sans: { file: "inter-tight-latin.woff2", name: "Inter Tight" },
} as const;

/** The tokens these cards use, spelled out for the same reason favicon.svg is. */
const INK_STRONG = "#f5f6f4";
const INK = "#f2f2f0";
const INK_MUTED = "#9a9ca1";
const ACCENT = "#2dd4bf";
const BACKGROUND = "#0a0a0a";

/** The brand mark, the same path the wordmark and the favicon draw. */
const MARK =
  "M3 4C12 8 22 9 29 4C27 11 25 14 22 14L17 14C17 19 18 23 11 29C13 21 8 11 3 4Z";

const PAD = 72;

function escapeText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** A font file inlined, so the render needs nothing off this disk. */
async function face({ file, name }: { file: string; name: string }) {
  const bytes = await readFile(`${FONTS}${file}`);

  return `@font-face{font-family:"${name}";font-style:normal;font-weight:200 800;src:url(data:font/woff2;base64,${bytes.toString("base64")}) format("woff2")}`;
}

/**
 * One headline line, with the accent tail split off the last one.
 *
 * The homepage puts "disappears." in teal and the card says the same sentence, so
 * it wears the same colour in the same place.
 */
function headline(card: Card): string {
  return card.lines
    .map((line, index) => {
      const tail = index === card.lines.length - 1 ? card.accent : undefined;

      if (!(tail && line.endsWith(tail))) {
        return `<div>${escapeText(line)}</div>`;
      }

      const head = line.slice(0, -tail.length);

      return `<div>${escapeText(head)}<span class="accent">${escapeText(tail)}</span></div>`;
    })
    .join("");
}

function markup(card: Card, fonts: string): string {
  const size = card.face === "display" ? 88 : 64;

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><style>
${fonts}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${CARD.width}px;height:${CARD.height}px;background:${BACKGROUND};
  font-family:"${FACES.sans.name}";
  display:flex;flex-direction:column;justify-content:space-between;padding:${PAD}px;
  -webkit-font-smoothing:antialiased}
.wordmark{display:flex;align-items:center;gap:14px;color:${INK};
  font-size:28px;font-weight:600;letter-spacing:-0.01em}
.wordmark svg{fill:${ACCENT}}
h1{color:${INK_STRONG};font-size:${size}px;
  font-family:"${FACES[card.face].name}";
  font-weight:${card.face === "display" ? 700 : 600};
  line-height:${card.face === "display" ? 0.98 : 1.05};
  letter-spacing:-0.02em}
.accent{color:${ACCENT}}
/* Balanced rather than ragged: the measure is one line short of the card's
 * width, so the default wrap leaves a single word alone on the second line. */
p{margin-top:28px;max-width:940px;color:${INK_MUTED};text-wrap:balance;
  font-size:26px;font-weight:400;line-height:1.5}
</style></head>
<body>
  <div class="wordmark">
    <svg width="28" height="28" viewBox="0 0 32 32"><path d="${MARK}"/></svg>
    SecureSend
  </div>
  <div>
    <h1>${headline(card)}</h1>
    <p>${escapeText(card.sub)}</p>
  </div>
</body>
</html>`;
}

const inlinedFaces = (
  await Promise.all([face(FACES.display), face(FACES.sans)])
).join("\n");

const browser = await chromium.launch();

try {
  // A page each, so the two cards draw at once and neither can inherit anything
  // the other left behind.
  await Promise.all(
    Object.values(CARDS).map(async (card) => {
      const page = await browser.newPage({
        deviceScaleFactor: 1,
        viewport: { height: CARD.height, width: CARD.width },
      });

      await page.setContent(markup(card, inlinedFaces), { waitUntil: "load" });
      // The faces are inlined, so this settles immediately. It is here because a
      // screenshot taken a frame early is a card set in the fallback stack, and
      // nothing about the file that lands would say so.
      await page.evaluate(() => document.fonts.ready);

      await writeFile(
        `${OUT}${card.file}`,
        await page.screenshot({ type: "png" })
      );
      console.log(`wrote ${card.file}`);
    })
  );
} finally {
  await browser.close();
}

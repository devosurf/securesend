import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { CARD, CARDS, type Card } from "../../apps/web/social.ts";

/*
 * Every picture the instance serves, drawn from the product's own tokens, mark
 * and font files: the two share cards, and the icons.
 *
 * `pnpm images`. The output is committed, because these are assets the instance
 * serves rather than something the build makes: putting a browser in the build
 * path to redraw a handful of static pictures on every deploy would be a strange
 * price for files that change when the design does and never otherwise.
 *
 * Drawn here rather than exported from a design tool for the reason the fonts are
 * self-hosted: the values are already written down. The colours are the tokens,
 * the faces are the woff2 files the app serves, and the mark is the path
 * src/ui/wordmark.tsx draws. So nothing here can quietly stop matching the
 * product, and moving a token moves all of it on the next run.
 *
 * Card sizes are the card's own. Faces, weights and tracking are the page's, but a
 * chat window renders a card at about a third of its width, so type set at the
 * interface's own sizes would arrive at eight or nine pixels. What is quoted there
 * is the voice, not the measurements.
 *
 * ==== why an icon needs drawing at all =====================================
 *
 * favicon.svg already exists and every current browser prefers it. This is for
 * the two readers that do not. A browser with no `link` to go on asks the root
 * for `/favicon.ico` before it has parsed anything, and Google's icon crawler
 * wants a raster it can put in a search result, where the guidance is a square
 * larger than 48. So the same path is rendered to PNGs and packed into an ico.
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

/**
 * The mark alone, on nothing, at one size.
 *
 * Transparent rather than on the product's own black, because these are shown on
 * somebody else's ground: a browser tab that follows the system theme, and a
 * search result that is white today and dark tomorrow. A black tile would be a
 * black rectangle in half of those.
 */
function iconMarkup(size: number) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><style>
*{margin:0;padding:0}
html,body{background:transparent}
svg{display:block}
</style></head>
<body><svg width="${size}" height="${size}" viewBox="0 0 32 32"><path d="${MARK}" fill="${ACCENT}"/></svg></body>
</html>`;
}

/**
 * The sizes packed into favicon.ico, and the one Google is pointed at.
 *
 * 16 and 32 are what a tab and a bookmark ask for. 48 is in there because it is
 * the size Google's guidance is written around. The 96 is a separate file rather
 * than a fourth entry in the ico, so the `link` in the head can name a size and
 * a type: an ico is a container, and a crawler reading one has to open it to
 * find out what is inside.
 */
const PACKED = [16, 32, 48] as const;
const RASTER = 96;

/**
 * An ico wrapping PNGs, which is the modern form of the format.
 *
 * A directory of fixed 16-byte entries, then the images themselves. Every entry
 * has to carry the offset its image lands at, so the header and the directory are
 * measured before the first byte of image data is placed.
 */
function ico(images: readonly { png: Buffer; size: number }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let at = header.length + directory.length;

  for (const [index, { png, size }] of images.entries()) {
    const entry = index * 16;

    directory.writeUInt8(size, entry);
    directory.writeUInt8(size, entry + 1);
    // Colour planes and bits per pixel. The palette and reserved bytes either
    // side stay zero, which is what "no palette" means here.
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(at, entry + 12);

    at += png.length;
  }

  return Buffer.concat([header, directory, ...images.map(({ png }) => png)]);
}

/** One icon, rendered on nothing at the size asked for. */
async function icon(from: Browser, size: number): Promise<Buffer> {
  const page = await from.newPage({
    deviceScaleFactor: 1,
    viewport: { height: size, width: size },
  });

  await page.setContent(iconMarkup(size), { waitUntil: "load" });

  return await page.screenshot({ omitBackground: true, type: "png" });
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

  const packed = await Promise.all(
    PACKED.map(async (size) => ({ png: await icon(browser, size), size }))
  );

  await writeFile(`${OUT}favicon.ico`, ico(packed));
  console.log(`wrote favicon.ico (${PACKED.join(", ")})`);

  await writeFile(`${OUT}icon-${RASTER}.png`, await icon(browser, RASTER));
  console.log(`wrote icon-${RASTER}.png`);
} finally {
  await browser.close();
}

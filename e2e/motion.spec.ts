import { expect, type Page, test } from "@playwright/test";
import { CONTEXT, clipboard, seal } from "./instance";

/*
 * The moves, at the durations the design fixes, and collapsing when the reader has
 * asked for that.
 *
 * The vocabulary is four moves at two scales, and src/styles/transitions.css owns
 * what they are. This is here because a duration is the one thing about them that
 * only a browser can be asked: a class is in the markup either way, and whether the
 * class means 520 milliseconds of uncover or nothing at all is a computed style.
 *
 * Three of the moves matter enough to name, and each one is asserted where the
 * product actually plays it:
 *
 *   locking   the envelope going quiet while the browser encrypts. A fade, not a
 *             spinner, because the one moment the product's promise is visible
 *             should look like the promise being kept.
 *   reveal    the uncover, 520ms, the slowest thing in the product on purpose.
 *   burn      something gone, with nothing eager replacing it: the dissolve, and the
 *             arrival held 120ms behind it so finality reads as stillness.
 *
 * Every one of them is asserted on the element that carries the class rather than by
 * watching pixels, because what the design fixes is the duration and the curve.
 * A screenshot diff would be a test of this machine's font rendering.
 */

/** The scale every move above is timed from, in milliseconds. tokens.css, and the
 * canvas's, which hold the same four numbers. */
const DURATIONS = {
  "--duration-instant": 90,
  "--duration-quick": 150,
  "--duration-settle": 260,
  "--duration-walk": 320,
} as const;

/** The two curves, as the browser resolves them on a standard property. */
const IN_OUT_SOFT = "cubic-bezier(0.4, 0, 0.2, 1)";
const OUT_QUICK = "cubic-bezier(0.2, 0, 0, 1)";

/**
 * How long a move collapses to when the reader has asked for less of it.
 *
 * Not zero. A move that takes no time at all never fires, and two things in this
 * interface unmount on the end of their own animation, so a duration of nothing
 * would leave them mounted. One millisecond is instant to a person and still an
 * event to the browser.
 */
const COLLAPSED = "0.001s";

const NOTE = "The one thing this envelope carries.";
const SEAL = "northwind";

/**
 * One of the scale's custom properties, in milliseconds.
 *
 * A number rather than the text, because the build is free to write `150ms` as
 * `.15s` and a test that read the spelling would be a test of the minifier.
 */
async function durationOn(page: Page, name: string): Promise<number> {
  const written = await page.evaluate(
    (property) =>
      getComputedStyle(document.documentElement)
        .getPropertyValue(property)
        .trim(),
    name
  );

  const number = Number.parseFloat(written);

  return written.endsWith("ms") ? number : number * 1000;
}

/**
 * The wrapper holding every part the sender owns, which is the thing that fades
 * while the browser encrypts. It is the one element in the envelope that fades and
 * the only one with the note inside it.
 */
function ownedParts(page: Page) {
  return page.locator("div.transition-opacity:has(textarea)");
}

/** A sealed envelope, sent, opened once, and left one wrong password in. */
async function upToTheRetry(page: Page): Promise<void> {
  await seal(page, { note: NOTE, seal: SEAL });
  const link = await clipboard(page);

  await page.goto(link);
  await page
    .getByRole("textbox", { name: "The password the sender gave you" })
    .fill("northwing");
  await page.getByRole("button", { name: "Open it once" }).click();
  await expect(
    page.getByRole("heading", { name: "That password didn't work." })
  ).toBeVisible();
}

test("the durations every move is timed from are the design's", async ({
  page,
}) => {
  await page.goto("/");

  const measured = await Promise.all(
    Object.keys(DURATIONS).map(
      async (name) => [name, await durationOn(page, name)] as const
    )
  );

  expect(Object.fromEntries(measured)).toEqual(DURATIONS);
});

test("the envelope goes quiet while the browser encrypts", async ({ page }) => {
  /* With a password, because deriving a key from one is deliberately slow: it is
   * the longest this state is ever on screen and the only reason it is worth
   * showing at all. */
  await page.goto("/");
  await page.getByPlaceholder("Paste the secret you need to send").fill(NOTE);
  await page.getByRole("button", { name: "Ask for a password" }).click();
  await page
    .getByPlaceholder("Set a password they'll need to open it")
    .fill(SEAL);

  const parts = ownedParts(page);
  await expect(parts).toHaveCSS("opacity", "1");
  await expect(parts).toHaveCSS("transition-duration", "0.15s");

  await page.getByRole("button", { name: "Create link" }).click();

  /* Half lit, and the control saying what it is doing rather than spinning. */
  await expect(parts).toHaveCSS("opacity", "0.5");
  await expect(page.getByRole("button", { name: "Locking…" })).toHaveAttribute(
    "aria-busy",
    "true"
  );

  await expect(
    page.getByRole("heading", { name: "Your link is ready." })
  ).toBeVisible();
});

test("the receipt arrives on the advance, in place", async ({ page }) => {
  await seal(page, { note: NOTE });

  /* The same job one step on, so it is an advance: the same keyframes and the same
   * 320ms the walk half uses, played in place because this step happens inside one
   * screen rather than across a navigation. */
  const arriving = page.locator(".ss-advance-in");
  await expect(arriving).toHaveCSS("animation-duration", "0.32s");
  await expect(arriving).toHaveCSS("animation-timing-function", OUT_QUICK);
});

test("the secret uncovers over 520ms, and a wrong password burns instead", async ({
  page,
  browser,
}) => {
  await seal(page, { note: NOTE });
  const link = await clipboard(page);

  const recipient = await browser.newContext(CONTEXT);
  const arrived = await recipient.newPage();
  await arrived.goto(link);
  await arrived.getByRole("button", { name: "Open it once" }).click();

  await expect(
    arrived.getByRole("heading", { name: "Here it is." })
  ).toBeVisible();

  /* The one slow moment in the product. Nothing else here is over 320ms. */
  const uncovering = arrived.locator(".ss-reveal-in");
  await expect(uncovering).toHaveCSS("animation-duration", "0.52s");
  await expect(uncovering).toHaveCSS("animation-timing-function", OUT_QUICK);

  await recipient.close();

  // ---- and the other way the same screen can change -----------------------
  await upToTheRetry(page);

  /* Something died, so it is a burn: the dissolve settles, and the arrival is held
   * behind it rather than being eager. */
  const settling = page.locator(".ss-burn-in");
  await expect(settling).toHaveCSS("animation-duration", "0.26s");
  await expect(settling).toHaveCSS("animation-delay", "0.12s");
  await expect(settling).toHaveCSS("animation-timing-function", IN_OUT_SOFT);
});

test("a navigation between pages runs a view transition", async ({ page }) => {
  /* The walk half of the vocabulary, and all of it this app reaches.
   *
   * Every named move in this product happens inside one screen: the receipt arriving,
   * the secret uncovering, the retry after a wrong password. The only navigation there
   * is goes between the homepage and the security page, which the vocabulary
   * deliberately leaves unnamed, so the plain crossfade is the right move and there is
   * no duration here to hold to a number. What is left worth asserting is that a walk
   * is a View Transition at all: a router that quietly stopped carrying them would
   * make every page change an instant cut with nothing going red. */
  await page.addInitScript(() => {
    const start = document.startViewTransition?.bind(document);
    Object.assign(window, { walks: 0 });
    if (start) {
      document.startViewTransition = (update) => {
        Object.assign(window, { walks: 1 });

        return start(update);
      };
    }
  });

  await page.goto("/");
  await page.getByRole("link", { exact: true, name: "Security" }).click();

  await expect(
    page.getByRole("heading", { name: "How this actually works." })
  ).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "walks"))).toBe(1);
});

test("every move collapses when the reader has asked for less", async ({
  page,
  browser,
}) => {
  /* Emulated per page rather than through `test.use({ reducedMotion })`, which this
   * version of the runner accepts and does not apply: the query stays unmatched and
   * the whole assertion below would pass for the wrong reason. Both pages get it,
   * because the sender's browser and the recipient's are two browsers. */
  const reduce = { reducedMotion: "reduce" } as const;

  await page.emulateMedia(reduce);
  await page.goto("/");
  await page.getByPlaceholder("Paste the secret you need to send").fill(NOTE);

  /* The dim stops being a transition rather than becoming a faster one, which is what
   * motion-reduce:transition-none means at every other fade in the interface too. */
  await expect(ownedParts(page)).toHaveCSS("transition-property", "none");

  await page.getByRole("button", { name: "Create link" }).click();
  await expect(
    page.getByRole("heading", { name: "Your link is ready." })
  ).toBeVisible();

  await expect(page.locator(".ss-advance-in")).toHaveCSS(
    "animation-duration",
    COLLAPSED
  );

  const link = await clipboard(page);

  const recipient = await browser.newContext(CONTEXT);
  const arrived = await recipient.newPage();
  await arrived.emulateMedia(reduce);
  await arrived.goto(link);
  await arrived.getByRole("button", { name: "Open it once" }).click();
  await expect(
    arrived.getByRole("heading", { name: "Here it is." })
  ).toBeVisible();

  await expect(arrived.locator(".ss-reveal-in")).toHaveCSS(
    "animation-duration",
    COLLAPSED
  );

  await recipient.close();

  await upToTheRetry(page);

  const settling = page.locator(".ss-burn-in");
  await expect(settling).toHaveCSS("animation-duration", COLLAPSED);
  /* The wait that made the burn feel final goes too. A reader who asked for less
   * motion should not be made to sit through the pause that motion was for. */
  await expect(settling).toHaveCSS("animation-delay", "0s");
});

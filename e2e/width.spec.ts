import { expect, type Page, test } from "@playwright/test";

/*
 * Every page a stranger can land on, at the width most of them will land on it.
 *
 * The journeys drive the desk composition, because a phone twin is the same
 * components at a media query and driving both lanes through the whole product
 * would double the slowest gate in the repository to re-prove what a width
 * already decides. What a width does not decide is whether the result fits: a
 * nav that runs three items and a wordmark across 350px, or a row whose longest
 * unbreakable word is wider than its column, pushes the document sideways. That
 * is invisible at 1440 and it is the first thing a reader meets at 390.
 *
 * A sideways document is also not a cosmetic failure. It is the one layout bug
 * that makes a page harder to read the more of it you have read, because every
 * line then starts off screen.
 *
 * Only the overflow, and nothing about what the pages say. What each page says,
 * and that all three wear the same nav with the current one as a span, is read
 * off the built documents by the claims audit, which is both cheaper and stricter
 * than asking a browser whether some text is visible. This file is here for the
 * one question only a layout engine can answer.
 */

/** An iPhone's viewport, which is what the design's phone lane is drawn at. */
const PHONE = { height: 844, width: 390 };

/** Everything meant to be found, which is everything with a nav on it. */
const PAGES = [
  "/",
  "/security",
  "/integrations",
  "/integrations/slack",
  "/integrations/cli",
] as const;

test.use({ viewport: PHONE });

/** How far the document can be scrolled sideways, which has to be nothing. */
async function overflowOf(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const { documentElement } = document;

    /* Clamped at nothing, because the room `scrollbar-gutter: stable` reserves
     * comes off the scrollable area without coming off clientWidth. On a platform
     * that gives a scrollbar room of its own, which every one of these runs on in
     * CI and none of them do on a phone, a page that fits perfectly measures its
     * fifteen reserved pixels short. A document narrower than its own viewport is
     * the thing this file wants; only a document wider than it is a finding, and
     * one that is wider still reports by how much. */
    return Math.max(
      0,
      documentElement.scrollWidth - documentElement.clientWidth
    );
  });
}

for (const path of PAGES) {
  test(`${path} holds at 390 without going sideways`, async ({ page }) => {
    await page.goto(path);

    /* The nav is the tightest line on any of them, so it is what this is most
     * likely to catch. Waited on rather than asserted about, so the measurement
     * below happens on a page that has finished arriving. */
    await expect(
      page.getByRole("navigation").getByText("Self-host")
    ).toBeVisible();

    expect(await overflowOf(page), `${path} scrolls sideways`).toBe(0);
  });
}

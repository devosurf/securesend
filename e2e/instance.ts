import {
  type BrowserContextOptions,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";

/*
 * What every journey in here needs: an envelope filled, a link taken off the
 * clipboard, and a way to name one row of an open secret.
 *
 * These are the sender's and the recipient's acts in the words the product uses
 * for them, and nothing more. A helper that knew what a journey means would be a
 * journey written twice.
 */

/** The port compose.smoke.yaml publishes. Not 3000: `pnpm dev` is there. */
export const INSTANCE = "http://127.0.0.1:3100";

/**
 * How every context in this suite is opened, so a recipient arriving in a fresh
 * one is the same browser as the sender who sent it.
 *
 * The config spreads this over the default context and the journeys hand it to
 * `browser.newContext`, because a context made that way inherits nothing.
 */
export const CONTEXT: BrowserContextOptions = {
  /** The files half of the take lands on a disk. */
  acceptDownloads: true,
  baseURL: INSTANCE,
  /** The text half of the take, and the sender's copy, are a permission. */
  permissions: ["clipboard-read", "clipboard-write"],
  /**
   * The desk composition. The phone twins are the same components at a media
   * query, so driving both lanes here would double the slowest gate in the
   * repository to re-prove what a width already decides.
   */
  viewport: { height: 900, width: 1440 },
};

export interface Draft {
  credentials?: { password: string; username: string };
  file?: { bytes: Buffer; name: string; type: string };
  note?: string;
  /**
   * What the recipient will also need, if the sender asks for one. Absent means the
   * link is enough. Named for the row it lands in rather than called a password,
   * because an envelope can already carry one of those as a credential.
   */
  seal?: string;
}

/**
 * Fills the envelope and presses the one control that seals it, then waits for
 * the receipt.
 *
 * Every part is added the way a sender adds it: the affordance, then the row it
 * opened. Nothing is set through the page's own state, because the point of
 * driving a browser at all is that these are presses.
 */
export async function seal(page: Page, draft: Draft): Promise<void> {
  await page.goto("/");

  if (draft.note !== undefined) {
    await page
      .getByPlaceholder("Paste the secret you need to send")
      .fill(draft.note);
  }

  if (draft.credentials) {
    await page
      .getByRole("button", { name: "Add a username and password" })
      .click();
    await page
      .getByPlaceholder("Paste the username")
      .fill(draft.credentials.username);
    await page
      .getByPlaceholder("Paste the password")
      .fill(draft.credentials.password);
  }

  if (draft.file) {
    // The picker is hidden because the control that opens it lives in two places.
    await page.locator('input[type="file"]').setInputFiles({
      buffer: draft.file.bytes,
      mimeType: draft.file.type,
      name: draft.file.name,
    });
    await expect(page.getByText(draft.file.name)).toBeVisible();
  }

  if (draft.seal !== undefined) {
    await page.getByRole("button", { name: "Ask for a password" }).click();
    await page
      .getByPlaceholder("Set a password they'll need to open it")
      .fill(draft.seal);
  }

  await page.getByRole("button", { name: "Create link" }).click();
  await expect(
    page.getByRole("heading", { name: "Your link is ready." })
  ).toBeVisible();
}

/** What this tab's clipboard holds. */
export async function clipboard(page: Page): Promise<string> {
  // A clipboard read needs the document focused, and a journey may have been
  // driving another tab.
  await page.bringToFront();

  return await page.evaluate(() => navigator.clipboard.readText());
}

/** Puts something on the clipboard that is not the thing about to be tested. */
export async function putAside(page: Page): Promise<void> {
  await page.bringToFront();
  await page.evaluate(() =>
    navigator.clipboard.writeText("not the thing being tested")
  );
}

/**
 * One row of an open secret, by the label it carries.
 *
 * The label is a direct child of the row, which is what makes this structural
 * rather than a guess: a row is the element whose own child says which part it is.
 * Copy and Show inside it say only that, so this is how they get told apart.
 */
export function part(page: Page, label: string): Locator {
  return page.locator(`div:has(> span:text-is("${label}"))`);
}

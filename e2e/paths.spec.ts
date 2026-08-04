import { readFile } from "node:fs/promises";
import { type Download, expect, test } from "@playwright/test";
import { CONTEXT, clipboard, INSTANCE, part, putAside, seal } from "./instance";

/*
 * The three journeys, end to end, against the built container.
 *
 * One sender's browser and one recipient's, and they are separate contexts
 * because that is the only honest way to drive this: the sender's device
 * remembers what it sent and holds the management token, and a recipient who
 * shared that storage would be a recipient the product does not have.
 *
 * What each journey is here to prove is the part no cheaper seam can reach.
 *
 *   handover    the key survives a round trip through a real address bar, and is
 *               gone from it afterwards; the clipboard takes the link and then
 *               the parts; a file comes back byte for byte
 *   password    the press spends the link whether the password is right or not,
 *               and a wrong one leaves the ciphertext in the tab to try again
 *   burn        the sender destroys a sealed secret, and the stranger who opens
 *               the link afterwards is told it was the sender who did it
 */

const NOTE =
  "VPN access for the Tuesday migration. Ping me on Slack if it doesn't connect.";
const USERNAME = "svc-deploy@northwind.io";
const PASSWORD = "x7Kq-9m2P-vT4w-Ls8d";
const SEAL = "northwind";

const FILE = {
  bytes: Buffer.from(
    "client\ndev tun\nproto udp\nremote vpn.northwind.io 1194\n"
  ),
  name: "northwind-vpn-profile.ovpn",
  type: "application/x-openvpn-profile",
};

/** A link this instance made, key and all. */
function isSecretLink(link: string): boolean {
  return link.startsWith(`${INSTANCE}/s/`) && link.includes("#");
}

/** What the browser actually wrote to the disk. */
async function bytesOf(saved: Download): Promise<Buffer> {
  const landed = await saved.path();

  return await readFile(landed);
}

test("a secret goes from one browser to another, and the link dies on the way", async ({
  page,
  browser,
}) => {
  await seal(page, {
    credentials: { password: PASSWORD, username: USERNAME },
    file: FILE,
    note: NOTE,
  });

  /* The press that made the link also put it on the clipboard, because pasting is
   * the sender's next move either way, so the control arrives already saying what
   * it managed to do rather than offering to do it. */
  const copy = page.getByRole("button", { name: "Copied" });
  await expect(copy).toBeVisible();

  /* And it is still a control. Something else on the clipboard first, so what comes
   * back is this press rather than the one that made the link. */
  await putAside(page);
  await copy.click();

  const link = await clipboard(page);

  expect(isSecretLink(link), `not a secret link: ${link}`).toBe(true);

  // ---- the recipient, in a browser that has never sent anything ----------
  const recipient = await browser.newContext(CONTEXT);
  const arrived = await recipient.newPage();
  await arrived.goto(link);

  await expect(
    arrived.getByRole("heading", { name: "Someone sent you a secret." })
  ).toBeVisible();
  await expect(
    arrived.getByText("Still sealed. Nobody has read it, including us.")
  ).toBeVisible();

  /* The key is out of the address bar before anything else happens, so this
   * device's history and its profile sync never hold it. */
  expect(arrived.url()).toBe(link.split("#")[0]);

  await arrived.getByRole("button", { name: "Open it once" }).click();

  await expect(
    arrived.getByRole("heading", { name: "Here it is." })
  ).toBeVisible();
  await expect(arrived.getByText(NOTE)).toBeVisible();
  await expect(arrived.getByText(USERNAME)).toBeVisible();

  // ---- one part at a time, which is what the rows are for ----------------
  await putAside(arrived);
  await part(arrived, "username").getByRole("button", { name: "Copy" }).click();
  expect(await clipboard(arrived)).toBe(USERNAME);

  /* And the masked row, still masked. The recipient is often on a shared screen, so a
   * password copies without being shown: the dots are what is on the page and the
   * password is what lands on the clipboard. */
  const masked = part(arrived, "password");
  await expect(masked.getByText("•".repeat(PASSWORD.length))).toBeVisible();

  await putAside(arrived);
  await masked.getByRole("button", { name: "Copy" }).click();
  expect(await clipboard(arrived)).toBe(PASSWORD);

  // ---- everything, in one press, reported in halves ----------------------
  await putAside(arrived);
  const saving = arrived.waitForEvent("download");
  await arrived.getByRole("button", { name: "Take everything" }).click();
  const saved = await saving;

  expect(saved.suggestedFilename()).toBe(FILE.name);
  expect((await bytesOf(saved)).equals(FILE.bytes)).toBe(true);

  expect(await clipboard(arrived)).toBe(
    `${NOTE}\n\nusername: ${USERNAME}\npassword: ${PASSWORD}`
  );
  /* Inside the main content, because that is where this lane puts the bar: the
   * panel's last row at a desk, and the page's own floor on a phone. Both are in the
   * document and one of them is display:none at any given width. */
  await expect(
    arrived
      .getByRole("main")
      .getByText(`Note and login copied. ${FILE.name} saved to your downloads.`)
  ).toBeVisible();

  // ---- and the link is over, for everybody ------------------------------
  const stranger = await browser.newContext(CONTEXT);
  const second = await stranger.newPage();
  await second.goto(link);

  await expect(
    second.getByRole("heading", { name: "This link has already been used." })
  ).toBeVisible();

  await recipient.close();
  await stranger.close();
});

test("a password holds the envelope shut, and a wrong one costs the link but not the secret", async ({
  page,
  browser,
}) => {
  await seal(page, { note: NOTE, seal: SEAL });

  const link = await clipboard(page);
  expect(isSecretLink(link), `not a secret link: ${link}`).toBe(true);

  /* The instance cannot tell a sealed envelope from a plain one: the flag and the
   * salt ride the fragment. So the sender's own receipt is where a password is
   * mentioned at all. */
  await expect(
    page.getByRole("heading", { name: "Send the password separately." })
  ).toBeVisible();

  const recipient = await browser.newContext(CONTEXT);
  const arrived = await recipient.newPage();
  await arrived.goto(link);

  /* By role rather than by placeholder: the move that swaps sealed for retry keeps
   * the outgoing copy mounted for the length of it, and that copy is aria-hidden,
   * so asking for the field a person can reach asks for exactly one. */
  const field = arrived.getByRole("textbox", {
    name: "The password the sender gave you",
  });
  await expect(field).toBeVisible();

  // ---- one wrong try ----------------------------------------------------
  await field.fill("northwing");
  await arrived.getByRole("button", { name: "Open it once" }).click();

  await expect(
    arrived.getByRole("heading", { name: "That password didn't work." })
  ).toBeVisible();
  await expect(
    arrived.getByText("Link is spent", { exact: true })
  ).toBeVisible();
  await expect(arrived.getByText("1 try in this tab")).toBeVisible();

  // ---- and the right one, on ciphertext the instance no longer has -------
  await field.fill(SEAL);
  await arrived.getByRole("button", { name: "Try again" }).click();

  await expect(
    arrived.getByRole("heading", { name: "Here it is." })
  ).toBeVisible();
  await expect(arrived.getByText(NOTE)).toBeVisible();

  await recipient.close();
});

test("the sender burns a sealed secret, and whoever opens the link is told who did it", async ({
  page,
  browser,
}) => {
  await seal(page, { note: NOTE });

  const link = await clipboard(page);
  expect(isSecretLink(link), `not a secret link: ${link}`).toBe(true);

  await page.getByRole("button", { name: "Burn it now" }).click();

  /* The one floating surface v0 allows itself, and the safe choice holds focus, so
   * the destroy is a press and never a stray Enter. */
  await expect(
    page.getByRole("heading", { name: "Burn this secret now?" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep it" })).toBeFocused();

  await page.getByRole("button", { exact: true, name: "Burn it" }).click();

  await expect(
    page.getByRole("heading", { name: "You burned it." })
  ).toBeVisible();

  const stranger = await browser.newContext(CONTEXT);
  const arrived = await stranger.newPage();
  await arrived.goto(link);

  /* The burn dialog promises this out loud, and it is the one dead end that keys
   * on why the secret is gone rather than only that it is. */
  await expect(
    arrived.getByRole("heading", { name: "The sender burned this link." })
  ).toBeVisible();
  await expect(arrived.getByText("Burned", { exact: true })).toBeVisible();
  await expect(arrived.getByText("nobody read it")).toBeVisible();

  await stranger.close();
});

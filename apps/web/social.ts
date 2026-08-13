/*
 * What each surface says about itself when somebody pastes its link somewhere.
 *
 * A link to this product is usually shared in a chat window, so the card a chat
 * window draws is the first thing most recipients ever see of it. That card is
 * build output the way the title and the description already were: the running
 * app never changes it, and a page that has to boot JavaScript to name itself is
 * not really static. So the whole table lives here, beside the build config that
 * writes it and the script that draws the images.
 *
 * Nothing here invents copy. Every headline and every sentence below is a line
 * the page itself already says, because a card is a quotation of the page and
 * not a second, looser edition of it that no designer ever saw.
 *
 * ==== the shell is a surface too ==========================================
 *
 * /s/:id is a secret's address and it gets a card on purpose. What arrives in a
 * chat today is a bare URL with the key cut out of the middle of it, which reads
 * like something you should not click. The card says what the link is, in the
 * same words the page behind it opens with.
 *
 * Two things keep that safe. The card is static, one file for every secret, so it
 * describes what the link is rather than whether it is still live: nothing about
 * a particular secret is in it, and nothing about it changes once the secret is
 * spent. And the fragment is never in the request, so a preview is fetched
 * without the key and cannot open anything.
 *
 * The shell keeps its noindex and robots.txt keeps disallowing /s/, because those
 * are aimed at crawlers building an index. Slack does not read robots.txt and
 * says so: its expander acts for a person who was handed the link rather than
 * crawling for one, which is exactly the client this card is for.
 */

/** The size every chat app crops to, and the one both images are drawn at. */
export const CARD = { height: 630, width: 1200 } as const;

/** The address the build cannot know, filled in per request by apps/api. */
export const ORIGIN = "%ORIGIN%";

/** --color-bg, spelled out: a static document has no stylesheet to read. */
export const BACKGROUND = "#0a0a0a";

/** One of the two images, and the words drawn on it. */
export interface Card {
  /** The tail of the last line that wears the accent, when one does. */
  accent?: string;
  /**
   * Which face the headline wears, matching the page the card stands for. The
   * homepage leads with the display cut and the reveal screen deliberately does
   * not, so a card that used one face for both would misquote one of them.
   */
  face: "display" | "sans";
  /** The file written into public/, served from this origin like any asset. */
  file: string;
  /** The headline, one entry per line: where it breaks is the design's call. */
  lines: readonly string[];
  /** The line under it. */
  sub: string;
}

/**
 * Two cards, because there are two things a link can be: the product, and one
 * secret somebody was sent. Every page meant to be found shares the product's
 * card. Their own headlines still ride in og:title, so the card is a brand plate
 * under a heading that says which page this is.
 */
export const CARDS = {
  product: {
    accent: "disappears.",
    face: "display",
    file: "og.png",
    lines: ["Send a secret", "that disappears."],
    sub: "Type it, paste it, or drop a file in. It's locked in this browser before it goes anywhere.",
  },
  secret: {
    face: "sans",
    file: "og-secret.png",
    lines: ["Someone sent you a secret."],
    sub: "This can only be opened once.",
  },
} as const satisfies Record<string, Card>;

/**
 * What an image says, for a reader whose client shows the alt text instead.
 *
 * Derived from the card's own words rather than written a second time, so the
 * description of an image cannot drift from the image.
 */
export function altOf(card: Card): string {
  return `SecureSend. ${card.lines.join(" ")} ${card.sub}`;
}

/** One document the build writes, and everything its head says. */
export interface Surface {
  card: Card;
  /**
   * The line a search result quotes back. The page's whole claim, headline
   * included, because a result has no headline of its own to lead with.
   */
  description: string;
  /** The file written into dist. */
  file: string;
  /** The card's headline, which is the page's own rather than its title. */
  headline: string;
  /**
   * The route to render, or null for the shell, which renders nothing.
   *
   * It is also what decides whether this surface is meant to be found: no route
   * of its own means no canonical address, and a document with no canonical
   * address has no business in an index. One fact rather than two that can
   * disagree.
   */
  path: string | null;
  /**
   * The line under the card's headline. Not the description: that one leads with
   * the headline, and a card printing the headline twice reads like a mistake.
   */
  summary: string;
  /** The document title, which is what a tab and a history entry carry. */
  title: string;
}

export const SURFACES: readonly Surface[] = [
  {
    card: CARDS.product,
    description:
      "Send a secret that disappears. Type it, paste it, or drop a file in. It's locked in this browser before it goes anywhere.",
    file: "index.html",
    headline: "Send a secret that disappears.",
    path: "/",
    summary:
      "Type it, paste it, or drop a file in. It's locked in this browser before it goes anywhere.",
    title: "SecureSend",
  },
  {
    card: CARDS.product,
    description:
      "How this actually works: the mechanism, the limits, and the things we are not claiming. Written to be checked against the source rather than believed.",
    file: "security.html",
    headline: "How this actually works",
    path: "/security",
    summary:
      "The mechanism, the limits, and the things we are not claiming. Written to be checked against the source rather than believed.",
    title: "How this actually works",
  },
  {
    card: CARDS.product,
    description:
      "Send a secret from where you already are. What an integration changes is where the errand starts and where the finished link lands.",
    file: "integrations.html",
    headline: "Send a secret from where you already are.",
    path: "/integrations",
    summary:
      "What an integration changes is where the errand starts and where the finished link lands.",
    title: "Send a secret from where you already are",
  },
  {
    card: CARDS.product,
    description:
      "Never paste a password in Slack again. Type /ss in any channel, your browser locks the secret before it leaves, and only the finished link posts back.",
    file: "integrations-slack.html",
    headline: "Never paste a password in Slack again.",
    path: "/integrations/slack",
    summary:
      "Type /ss in any channel, your browser locks the secret before it leaves, and only the finished link posts back.",
    title: "Never paste a password in Slack again",
  },
  {
    card: CARDS.product,
    description:
      "Pipe a secret out, get one link back. cat key.pem | securesend create. The encrypting happens on your machine, the same way it happens in a tab, and only the finished link comes back.",
    file: "integrations-cli.html",
    headline: "Pipe a secret out, get one link back.",
    path: "/integrations/cli",
    summary:
      "cat key.pem | securesend create. The encrypting happens on your machine, the same way it happens in a tab, and only the finished link comes back.",
    title: "Pipe a secret out, get one link back",
  },
  {
    card: CARDS.secret,
    description:
      "This can only be opened once. Opening it decrypts it in your browser and wipes the copy on the server.",
    file: "shell.html",
    headline: "Someone sent you a secret.",
    path: null,
    summary:
      "This can only be opened once. Opening it decrypts it in your browser and wipes the copy on the server.",
    /*
     * The tab stays the product's name rather than the card's headline. A title
     * is on screen for as long as the page is, so it would still read "Someone
     * sent you a secret" over a dead end, and it lands in browser history where
     * nothing needs to announce what the address was for.
     */
    title: "SecureSend",
  },
];

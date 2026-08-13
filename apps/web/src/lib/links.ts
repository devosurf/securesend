/*
 * Every destination the product points at outside itself, in one place.
 *
 * The same reason the interface consumes tokens instead of hex: six screens
 * each spelling out a GitHub URL is six chances to drift, and a footer link
 * that quietly rots is worse than no link, because it reads as a maintained
 * product that isn't. A screen names a destination; this file knows the address.
 *
 * The trust content lives as markdown next to the code it describes, so the
 * security page and the footer link into the repository for depth instead of
 * restating it. Some of these files arrive later in the build than the pages
 * that point at them.
 */
const REPO = "https://github.com/devosurf/securesend";

export const LINKS = {
  /** Reports about secrets sent through us, which is a different inbox. */
  abuse: "mailto:abuse@securesend.dev",
  /** One root changelog, written as prose per release. */
  changelog: `${REPO}/blob/main/CHANGELOG.md`,
  /** `packages/crypto`: zero dependencies, and the only part you must trust. */
  crypto: `${REPO}/tree/main/packages/crypto`,
  /** Disclosure. */
  security: "mailto:security@securesend.dev",
  /**
   * The Add to Slack button, on the integrations pages. This instance's own
   * install handshake rather than Slack's, because the scope list and the
   * client id are ours to state and a self-hoster's are theirs.
   */
  slackInstall: "/slack/install",
  /** One container, one compose file. The self-host story in full. */
  selfHosting: `${REPO}/blob/main/docs/self-hosting.md`,
  /** The repository itself. "Read the source", "Whole repository". */
  source: REPO,
  /** The long form behind the security page. */
  threatModel: `${REPO}/blob/main/docs/threat-model.md`,
  /** Why the core is AGPLv3 and what that means if you run it. */
  whyAgpl: `${REPO}/blob/main/docs/why-agpl.md`,
} as const;

/*
 * Spread onto any link that leaves for the web.
 *
 * `noreferrer` is not boilerplate here. A recipient reads a secret at
 * /s/<id>#key, and while the fragment is never sent in a Referer header, the
 * path is, and that path is the secret's address. Any outbound click would hand
 * it to whoever is on the other end. The server sets Referrer-Policy at the
 * header level too; this is the same rule stated where the link is written, so
 * a screen cannot quietly opt out of it.
 *
 * Not applied to `mailto:`, which opens a client rather than a tab.
 */
export const OUTBOUND = { rel: "noreferrer", target: "_blank" } as const;

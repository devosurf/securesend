/*
 * The claims audit's checks, as functions over text.
 *
 * This product's claims are the product. "Zero third-party requests", "the key
 * never reaches us", "we are not making a compliance claim": each one is an
 * invitation to go and check, and a page that quietly stopped being true would be
 * worse than a page that never said it. So the claims are checked on every commit
 * rather than remembered, and the checks live here as pure functions so that the
 * audit can be pointed at a seeded violation and made to fail on purpose. A gate
 * nobody has watched fail is a gate nobody should trust.
 *
 * `audit.test.ts` points these at what the build actually wrote. `checks.test.ts`
 * points them at violations written by hand.
 */

/** One thing that is wrong, and where. */
export interface Finding {
  what: string;
  where: string;
}

/** Anything with a scheme or a protocol-relative start, which is another origin. */
const OFF_ORIGIN = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

/*
 * What the browser goes and gets by itself.
 *
 * `src` on any tag is a fetch. `href` is one only on `<link>`: on an anchor it is
 * somewhere a reader chooses to go, and the security page points at GitHub on
 * purpose. The claim is about requests the page makes, not destinations it offers.
 */
const TAG_SOURCE = /<[^>]+?\ssrc="([^"]*)"/gi;
const LINK_HREF = /<link\b[^>]*?\shref="([^"]*)"/gi;

/** A script element with anything between its tags. */
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

/** A style element, and a style attribute. Both are what the policy will not run. */
const INLINE_STYLE = /<style[^>]*>[\s\S]*?<\/style>|\sstyle="/gi;

const TAGS = /<[^>]*>/g;
const ENTITY = /&(?:#\d+|#x[\da-f]+|[a-z]+);/gi;
const WHITESPACE_RUN = /\s+/g;

/** `/* ... *\/` and `// ...`, but not the `//` in a URL. */
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /(?<!:)\/\/[^\n]*/g;

/**
 * A claim that is never honest, whatever surrounds it. Nothing on any surface of
 * this product may say one of these, in any context, including as a denial: the
 * honest register is to name the mechanism, and reaching for one of these words
 * means the mechanism was not enough.
 */
const FORBIDDEN = [
  "military-grade",
  "military grade",
  "bank-grade",
  "bank grade",
  "bank-level",
  "nsa-grade",
  "unhackable",
  "uncrackable",
  "unbreakable",
  "hacker-proof",
  "hackerproof",
  "100% secure",
  "completely secure",
  "absolutely secure",
  "perfectly secure",
  "totally secure",
  "impossible to hack",
  "impossible to intercept",
  "zero risk",
] as const;

/**
 * A claim that is honest only as a denial.
 *
 * These are the certifications and the assurances this product does not have, and
 * the words appear on purpose: a security page with no compliance section reads as
 * an oversight, so ours says out loud which badges are absent. That means the
 * audit cannot simply ban the words. It asks instead that the sentence carrying
 * one also denies it.
 *
 * The gap that leaves is real and worth naming: "SOC 2 compliant, no exceptions"
 * would pass. What the rule buys is that adding one of these words to a page can
 * only be done in a sentence shaped like a denial, which is a much harder shape to
 * arrive at by accident than a claim is.
 */
const DENIED_ONLY = [
  "soc 2",
  "soc2",
  "hipaa",
  "iso 27001",
  "pci dss",
  "fedramp",
  "gdpr compliant",
  "external audit",
  "externally audited",
  "independently audited",
  "security audit",
  "penetration test",
  "compliance badge",
  "cannot be breached",
  "can't be breached",
  "cannot be hacked",
] as const;

const DENIAL =
  /\b(?:not|never|no|none|nobody|nothing|without|absent|refuses?)\b|n't/i;

/** Sentence enough for the purpose: what a denial has to share a breath with. */
const SENTENCE_END = /(?<=[.!?:])\s+|\n{2,}/;

/**
 * The words a reader sees, with the markup and the entities taken out.
 *
 * A tag becomes one space rather than nothing, so that two words either side of
 * one do not run together into a third that nobody wrote. Runs of whitespace then
 * collapse, for the opposite reason: "SOC<span> </span>2" reads as one phrase to a
 * person, and leaving it as two spaces would hide it from a check looking for the
 * phrase. Together they mean a claim can be neither invented nor concealed by where
 * the markup happens to fall.
 */
export function visibleText(html: string): string {
  return html
    .replaceAll(TAGS, " ")
    .replaceAll(ENTITY, " ")
    .replaceAll(WHITESPACE_RUN, " ");
}

/** `<meta name="description" content="...">`, in either attribute order. */
const DESCRIPTION =
  /<meta\b(?=[^>]*\bname="description")[^>]*\bcontent="([^"]*)"/gi;

/**
 * What a page says about itself out of a reader's sight.
 *
 * A description is copy like any other and the claims rule binds it, but it rides in
 * an attribute, so `visibleText` throws it away with the tag around it. Without this,
 * the one line search results quote back is the one line the audit cannot read. It
 * also comes from the build rather than from a route file, which puts it outside every
 * directory the audit reads as source.
 */
export function describedAs(html: string): string[] {
  return matches(html, DESCRIPTION);
}

/*
 * The share card's words. Open Graph spells its attribute `property` and Twitter
 * spells the same idea `name`, so both are matched.
 */
const CARD_COPY =
  /<meta\b(?=[^>]*\b(?:name|property)="(?:og:title|og:description|og:image:alt)")[^>]*\bcontent="([^"]*)"/gi;

/**
 * What a link preview says, which is copy nobody on the page ever sees.
 *
 * The same argument as `describedAs`, one step further out. A card is read in
 * somebody else's chat window by a person who has not arrived yet, which for most
 * recipients makes it the first sentence of this product they ever read. It rides
 * entirely in attributes, so `visibleText` drops it with the tag around it, and it
 * comes from the build rather than from a route. Both halves of the claims rule
 * bind it and this is the only place that can read it.
 */
export function cardCopy(html: string): string[] {
  return matches(html, CARD_COPY);
}

/**
 * Source with its comments removed, because a comment is not a claim.
 *
 * The rule is about what a reader is told, and comments do not ship: the bundler
 * drops them. It matters more than it sounds, because the honest way to write down
 * a banned-words rule is to list the banned words, and the file that does that
 * would otherwise fail its own audit.
 */
export function withoutComments(source: string): string {
  return source.replaceAll(BLOCK_COMMENT, " ").replaceAll(LINE_COMMENT, " ");
}

function matches(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map(([, group]) => group ?? "");
}

/** Everything a document asks the browser to go and fetch from another origin. */
export function offOriginLoads(where: string, html: string): Finding[] {
  return [...matches(html, TAG_SOURCE), ...matches(html, LINK_HREF)]
    .filter((target) => OFF_ORIGIN.test(target))
    .map((target) => ({ what: `loads ${target} from another origin`, where }));
}

/** `url(...)` targets, quoted or bare, and `@import` in either spelling. */
const CSS_URL = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
const CSS_IMPORT = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g;

/**
 * Everything a stylesheet fetches from another origin.
 *
 * Separate from the document check because a stylesheet is where this would arrive
 * without anybody deciding to: a dependency's CSS naming a hosted font pulls a
 * request off this origin without a line of our own code changing. The source
 * stylesheets are checked in the web app's own tests; this reads the bundle that
 * ships, which is the artifact the claim is actually about.
 *
 * Only stylesheets, not the script bundle. Bundled JavaScript legitimately contains
 * the repository and mail addresses the footer offers, so scanning it for URLs would
 * flag the destinations the product is supposed to have.
 */
export function offOriginInStylesheet(where: string, css: string): Finding[] {
  return [...matches(css, CSS_URL), ...matches(css, CSS_IMPORT)]
    .filter((target) => OFF_ORIGIN.test(target))
    .map((target) => ({
      what: `fetches ${target} from another origin`,
      where,
    }));
}

/**
 * Script and style the content security policy would refuse to run.
 *
 * The policy is `self` with no `unsafe-inline`, so anything inline here is not a
 * weakening of the product, it is a page that would silently break in production.
 * Which is the worse failure of the two, and the reason this is a gate.
 */
export function inlineCode(where: string, html: string): Finding[] {
  const scripts = [...html.matchAll(INLINE_SCRIPT)]
    .filter(([, body]) => (body ?? "").trim() !== "")
    .map(() => ({ what: "carries an inline script", where }));

  const styles = [...html.matchAll(INLINE_STYLE)].map(() => ({
    what: "carries an inline style",
    where,
  }));

  return [...scripts, ...styles];
}

function sentences(text: string): string[] {
  return text.split(SENTENCE_END);
}

/** Claims this product is not allowed to make, wherever a reader would see them. */
export function bannedClaims(where: string, text: string): Finding[] {
  const findings: Finding[] = [];

  for (const sentence of sentences(text)) {
    const lowered = sentence.toLowerCase();

    for (const phrase of FORBIDDEN) {
      if (lowered.includes(phrase)) {
        findings.push({ what: `claims "${phrase}"`, where });
      }
    }

    if (DENIAL.test(sentence)) {
      continue;
    }

    for (const phrase of DENIED_ONLY) {
      if (lowered.includes(phrase)) {
        findings.push({
          what: `says "${phrase}" without denying it`,
          where,
        });
      }
    }
  }

  return findings;
}

/**
 * The two labels that are only honest beside the caveat, and the caveat itself.
 *
 * This is the claims rule stated most precisely in AGENTS.md: "zero-knowledge" and
 * "end-to-end" may appear only within sight of the caveat that anyone holding the
 * whole link can decrypt. Both labels are true here in a specific sense and read as
 * a much bigger promise than they are, so the caveat is what makes them honest.
 *
 * "Within sight" is a distance, not a document: a caveat in a footer does not
 * qualify a claim in a hero. So the window below is what "in sight" means in
 * characters, measured either side of the label.
 */
const LABELS = /zero-knowledge|zero knowledge|end-to-end|end to end/gi;

/**
 * The caveat, in the spellings the product actually uses for it.
 *
 * Several, because it is written to fit the sentence it lands in rather than pasted:
 * "anyone holding the whole link can decrypt it" on the security page, "the link is
 * the secret" where the point is what to do about it. What they share is naming the
 * link as sufficient to read the secret, which is the thing a reader has to know.
 */
const CAVEAT =
  /(?:holding|holds|has|with) the (?:whole|full|entire) link|the link is the secret|(?:whole|full) link can decrypt/i;

const IN_SIGHT = 1200;

/** Markdown emphasis, which a reader does not see and a phrase should survive. */
const EMPHASIS = /[*_`]+/g;

/**
 * A label used out of sight of the caveat.
 *
 * The window is generous on purpose. The point is not to police prose, it is to
 * catch the case that actually happens: a page or a document that reaches for the
 * strong label and never gets round to saying what it does not mean.
 *
 * Emphasis comes out first, so that "the link **is** the secret" counts as the
 * caveat it plainly is. A rule that could be defeated by bolding a word would be a
 * rule about punctuation.
 */
export function unlabelledClaims(where: string, text: string): Finding[] {
  const plain = text.replaceAll(EMPHASIS, "");

  return [...plain.matchAll(LABELS)]
    .filter(({ index }) => {
      const from = Math.max(0, index - IN_SIGHT);

      return !CAVEAT.test(plain.slice(from, index + IN_SIGHT));
    })
    .map(([label]) => ({
      what: `says "${label}" out of sight of the caveat`,
      where,
    }));
}

/** A file the audit reads, named the way a failure should name it. */
export interface Source {
  /** Relative to the repository root, so a finding is something greppable. */
  path: string;
  text: string;
}

/**
 * A file that touches something only a named few files may touch.
 *
 * Both confinement rules in this product have the same shape and the same reason:
 * some surface is dangerous, so the set of places that reach it is kept small
 * enough to read. What differs is the surface and the list, so they differ here as
 * arguments rather than as two functions.
 *
 * A path is allowed if it starts with an allowed entry, so a folder and a single
 * file are both expressible without a second concept.
 */
function confinedTo(
  files: readonly Source[],
  allowed: readonly string[],
  surface: { pattern: RegExp; what: string }
): Finding[] {
  return files
    .filter(
      ({ path, text }) =>
        !allowed.some((entry) => path.startsWith(entry)) &&
        surface.pattern.test(withoutComments(text))
    )
    .map(({ path }) => ({
      what: `${surface.what}, which is confined to ${allowed.join(" and ")}`,
      where: path,
    }));
}

/**
 * Every way a line of code can get at the URL fragment.
 *
 * The key lives in the fragment, so every line that can see one is a line that
 * could leak it, and keeping that set small is what makes the zero-knowledge rule
 * reviewable: a handful of places to read rather than a whole app to audit.
 *
 * Wider than reading `.hash`, deliberately. Cutting a link at its `#` and taking
 * `location.href` both put a fragment within reach, and the second one is how
 * somebody would do this by accident. Building a link with a `#` in it is not here,
 * because composing the link is what the compose seam is for.
 */
const FRAGMENT_ACCESS =
  /location\.hash|\.hash\b|history\.(?:replace|push)State|split\(\s*["'`]#|location\.href/;

/**
 * Where the fragment may be touched, and there are two.
 *
 * `reveal` is the one that reads a key, once, and scrubs it from the address bar on
 * the way past. `watch/statuses.ts` is the opposite job and is here for the same
 * reason: it cuts a link at its `#` so the sender's own history can never carry a
 * key into a dialog. A rule that only named `reveal` would have been a rule this
 * repository already broke, so both are named and a third would fail.
 */
export const FRAGMENT_SITES = [
  "apps/web/src/reveal",
  "apps/web/src/watch/statuses.ts",
] as const;

export function strayFragmentReaders(
  files: readonly Source[],
  allowed: readonly string[] = FRAGMENT_SITES
): Finding[] {
  return confinedTo(files, allowed, {
    pattern: FRAGMENT_ACCESS,
    what: "touches the url fragment",
  });
}

/** `FOO=` or `# FOO=`, which is how a commented default is written. */
const DOCUMENTED = /^#?\s*([A-Z][A-Z\d_]*)=/gm;

/**
 * Every variable the example file documents. A commented-out line counts: that is
 * how a default is shown, and the reader still learns the name exists.
 */
export function documentedVariables(example: string): Set<string> {
  return new Set(matches(example, DOCUMENTED));
}

/**
 * A variable the process reads that nobody was told about.
 *
 * "A complete `.env.example`" is a promise to self-hosters, and the way it breaks
 * is not malice: somebody adds a knob, tests it through the environment, and never
 * writes the line. So the promise is checked against what the code destructures
 * off `process.env` rather than trusted.
 */
export function undocumentedVariables(
  read: readonly string[],
  documented: ReadonlySet<string>
): Finding[] {
  return read
    .filter((name) => !documented.has(name))
    .map((name) => ({
      what: `${name} is read but not in .env.example`,
      where: ".env.example",
    }));
}

/** A destructure off `process.env`, and the names inside it. */
const ENV_DESTRUCTURE = /(?:const|let)\s*\{([^}]*)\}\s*=\s*process\.env/g;
const NAME = /[A-Z][A-Z\d_]*/g;

export function variablesRead(source: string): string[] {
  return matches(source, ENV_DESTRUCTURE).flatMap(
    (names) => names.match(NAME) ?? []
  );
}

/** Anywhere `process.env` is reached for. */
const ENV_ACCESS = /process\.env|import\.meta\.env/;

/**
 * A file that reads the environment without going through the one module that
 * validates it.
 *
 * This is what makes the check above sound. Comparing `.env.example` against a
 * single destructure only proves the file complete if that destructure is the only
 * one, so a knob read straight off `process.env` somewhere else would be a
 * variable nobody documented and nobody validated either.
 */
export function strayEnvReaders(
  files: readonly Source[],
  allowed: readonly string[]
): Finding[] {
  return confinedTo(files, allowed, {
    pattern: ENV_ACCESS,
    what: "reads the environment",
  });
}

/** `https://github.com/owner/repo/blob/main/<path>`, and the `tree` form. */
const REPO_PATH =
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:blob|tree)\/[^/]+\/(.+)$/;

/**
 * Every path inside this repository that the interface sends a reader to.
 *
 * The footer promises depth: the security story in full, the self-host story, why
 * the licence. A destination that 404s is worse than no destination, because it
 * reads as a maintained product that is not one, on the page whose whole argument
 * is that you can go and check. So the addresses come from the module that owns
 * them and each one has to be a file that exists.
 */
export function repositoryDestinations(urls: readonly string[]): string[] {
  return urls.flatMap((url) => {
    const path = REPO_PATH.exec(url)?.[1];

    return path === undefined ? [] : [path];
  });
}

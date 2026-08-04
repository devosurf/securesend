import { describe, expect, it } from "vitest";
import {
  bannedClaims,
  describedAs,
  documentedVariables,
  type Finding,
  inlineCode,
  offOriginInStylesheet,
  offOriginLoads,
  repositoryDestinations,
  strayEnvReaders,
  strayFragmentReaders,
  undocumentedVariables,
  unlabelledClaims,
  variablesRead,
  visibleText,
  withoutComments,
} from "./checks";

/*
 * Each check, pointed at a violation on purpose.
 *
 * `audit.test.ts` is the gate; this is the gate's own evidence. An audit that has
 * only ever been green proves that it ran, not that it works, and the failure mode
 * of a checker is silence: a regex that stopped matching keeps passing forever and
 * reads exactly like a product that stayed honest. So every check here is shown
 * catching the thing it exists to catch, and shown leaving the honest version of
 * the same text alone.
 *
 * Every catch asserts what was caught rather than that something was. "It returned
 * a non-empty array" is the assertion a broken check passes by accident, which is
 * the exact failure this file exists to rule out.
 */

/** What a check said was wrong, which is the part worth asserting on. */
function whats(findings: readonly Finding[]): string[] {
  return findings.map(({ what }) => what);
}

describe("off-origin loads", () => {
  it.each([
    '<script src="https://cdn.example.com/a.js"></script>',
    '<script src="//cdn.example.com/a.js"></script>',
    '<link href="https://fonts.example.com/x.css" rel="stylesheet">',
    '<img src="http://tracker.example.com/pixel.gif">',
  ])("catches %s", (html) => {
    expect(whats(offOriginLoads("seeded", html))).toEqual([
      expect.stringContaining("from another origin"),
    ]);
  });

  it("names the origin it caught, so a failure is actionable", () => {
    const html = '<script src="https://cdn.example.com/a.js"></script>';

    expect(whats(offOriginLoads("seeded", html))).toEqual([
      "loads https://cdn.example.com/a.js from another origin",
    ]);
  });

  it("leaves this origin's own assets alone", () => {
    const html = [
      '<script src="/assets/main-a1b2c3.js" type="module"></script>',
      '<link href="/assets/main-d4e5f6.css" rel="stylesheet">',
      '<link href="/fonts/inter-tight-latin.woff2" rel="preload">',
    ].join("");

    expect(offOriginLoads("honest", html)).toEqual([]);
  });

  it("leaves a link a reader chooses to follow alone", () => {
    // A destination is not a fetch. The security page points at GitHub on purpose,
    // and the claim is about what the browser goes and gets by itself.
    const html = '<a href="https://github.com/devosurf/securesend">source</a>';

    expect(offOriginLoads("honest", html)).toEqual([]);
  });
});

describe("off-origin loads from a stylesheet", () => {
  it.each([
    "@font-face{src:url(https://fonts.gstatic.com/s/x.woff2)}",
    '@import "https://fonts.example.com/inter.css";',
    ".hero{background:url('//cdn.example.com/bg.png')}",
  ])("catches %s", (css) => {
    expect(whats(offOriginInStylesheet("seeded", css))).toEqual([
      expect.stringContaining("from another origin"),
    ]);
  });

  it("leaves a self-hosted font alone", () => {
    const css = "@font-face{src:url(/fonts/inter-tight-latin.woff2)}";

    expect(offOriginInStylesheet("honest", css)).toEqual([]);
  });
});

describe("inline code", () => {
  it("catches an inline script", () => {
    expect(
      whats(inlineCode("seeded", "<script>window.track = 1</script>"))
    ).toEqual(["carries an inline script"]);
  });

  it("catches an inline style element", () => {
    expect(
      whats(inlineCode("seeded", "<style>body{color:red}</style>"))
    ).toEqual(["carries an inline style"]);
  });

  it("catches a style attribute", () => {
    expect(
      whats(inlineCode("seeded", '<div style="color:red"></div>'))
    ).toEqual(["carries an inline style"]);
  });

  it("leaves a linked script alone", () => {
    const html = '<script src="/assets/main.js" type="module"></script>';

    expect(inlineCode("honest", html)).toEqual([]);
  });

  it("leaves an empty script element alone", () => {
    // What a bundler sometimes emits, and it runs nothing.
    expect(inlineCode("honest", "<script></script>")).toEqual([]);
  });
});

describe("banned claims", () => {
  it.each([
    ["Military-grade encryption you can rely on.", "military-grade"],
    ["Your secrets are 100% secure.", "100% secure"],
    ["An unhackable one-time link.", "unhackable"],
    ["Bank-grade security, in your browser.", "bank-grade"],
    ["It is impossible to intercept.", "impossible to intercept"],
  ])("catches %s", (text, phrase) => {
    expect(whats(bannedClaims("seeded", text))).toEqual([`claims "${phrase}"`]);
  });

  it("catches a forbidden claim even inside a denial", () => {
    // The honest register is to name the mechanism. There is no sentence in which
    // reaching for one of these was the right move, so a denial does not redeem it.
    const text = "This is not military-grade, it is AES-256-GCM.";

    expect(whats(bannedClaims("seeded", text))).toEqual([
      'claims "military-grade"',
    ]);
  });

  it.each([
    ["SOC 2 certified and HIPAA compliant.", "soc 2"],
    ["Independently audited by a third party.", "independently audited"],
    ["We passed a penetration test.", "penetration test"],
  ])("catches %s", (text, phrase) => {
    expect(whats(bannedClaims("seeded", text))).toContain(
      `says "${phrase}" without denying it`
    );
  });

  it.each([
    "We have not had an external audit, we are not SOC 2 certified, and we are not making a HIPAA claim.",
    "There are no compliance badges on this page.",
    "We are not going to tell you we cannot be breached.",
    "No external audit. Not SOC 2 certified. No HIPAA claim.",
  ])("leaves the denial alone: %s", (text) => {
    expect(bannedClaims("honest", text)).toEqual([]);
  });

  it("keeps a denial from covering the next sentence", () => {
    const text = "We have no analytics. We are SOC 2 certified.";

    expect(whats(bannedClaims("seeded", text))).toEqual([
      'says "soc 2" without denying it',
    ]);
  });

  it("leaves the mechanism alone", () => {
    const text =
      "Your secret is encrypted in your browser with AES-256-GCM through Web Crypto. Anyone holding the full link can decrypt it.";

    expect(bannedClaims("honest", text)).toEqual([]);
  });
});

describe("a label out of sight of its caveat", () => {
  it.each(["zero-knowledge", "zero knowledge", "end-to-end", "end to end"])(
    "catches %s standing on its own",
    (label) => {
      const text = `Secrets are ${label} encrypted. Send them in ten seconds.`;

      expect(whats(unlabelledClaims("seeded", text))).toEqual([
        `says "${label}" out of sight of the caveat`,
      ]);
    }
  );

  it.each([
    "This is end-to-end encrypted. Anyone holding the whole link can decrypt it, so treat the link as the secret.",
    "Anyone holding the full link can decrypt it. That is the sense in which this is zero-knowledge.",
    "The link is the secret. End-to-end here means the key exists only in two browsers.",
  ])("leaves a label beside its caveat alone: %s", (text) => {
    expect(unlabelledClaims("honest", text)).toEqual([]);
  });

  it("does not let a caveat in a footer qualify a claim in a hero", () => {
    const text = `We are zero-knowledge.${" filler.".repeat(400)}Anyone holding the whole link can decrypt it.`;

    expect(whats(unlabelledClaims("seeded", text))).toEqual([
      'says "zero-knowledge" out of sight of the caveat',
    ]);
  });

  it("catches the second use when only the first was qualified", () => {
    const text = `Anyone holding the whole link can decrypt it, which is what zero-knowledge means here.${" filler.".repeat(400)}Fully end-to-end.`;

    expect(whats(unlabelledClaims("seeded", text))).toEqual([
      'says "end-to-end" out of sight of the caveat',
    ]);
  });
});

describe("what a reader sees", () => {
  it("reads the words out of a document", () => {
    const html = '<p class="body">Anyone holding the <em>full</em> link.</p>';

    expect(visibleText(html)).toContain("Anyone holding the");
    expect(visibleText(html)).not.toContain("class");
  });

  it("does not let a tag join two words into a third", () => {
    expect(
      visibleText("<span>mil</span><span>itary-grade</span>")
    ).not.toContain("military-grade");
  });

  it("does not let markup hide a phrase in extra whitespace", () => {
    // "SOC<span> </span>2" is one phrase to a reader, and two spaces to a substring
    // search that had not collapsed them.
    const html = "<p>We are SOC<span> </span>2 certified.</p>";

    expect(whats(bannedClaims("seeded", visibleText(html)))).toContain(
      'says "soc 2" without denying it'
    );
  });

  it("takes comments out of source, because a comment is not a claim", () => {
    const source = '/* military-grade is banned */\nconst a = "AES-256-GCM";';

    expect(bannedClaims("honest", withoutComments(source))).toEqual([]);
  });

  it("keeps a url intact while taking line comments out", () => {
    const source =
      'const REPO = "https://github.com/devosurf/securesend"; // the repo';

    expect(withoutComments(source)).toContain("https://github.com/devosurf");
  });

  it("still sees a claim that is not in a comment", () => {
    const source = '/* fine */\nconst copy = "100% secure";';

    expect(whats(bannedClaims("seeded", withoutComments(source)))).toEqual([
      'claims "100% secure"',
    ]);
  });
});

describe("what a page says about itself", () => {
  it("reads a description out of the head, in either attribute order", () => {
    const html =
      '<meta content="Send a secret." name="description">' +
      '<meta name="description" content="And again.">';

    expect(describedAs(html)).toEqual(["Send a secret.", "And again."]);
  });

  it("leaves every other meta tag alone", () => {
    const html =
      '<meta content="noindex" name="robots">' +
      '<meta content="width=device-width" name="viewport">';

    expect(describedAs(html)).toEqual([]);
  });

  it("catches a claim a reader never sees, which is what this is for", () => {
    // visibleText throws the tag away, so without describedAs this line is the one
    // surface search results quote and the one surface nothing checks.
    const html = '<meta content="Bank-grade security." name="description">';

    expect(visibleText(html)).not.toContain("Bank-grade");
    expect(
      whats(describedAs(html).flatMap((said) => bannedClaims("seeded", said)))
    ).toEqual(['claims "bank-grade"']);
  });

  it("holds a description to the caveat like any other copy", () => {
    const html = '<meta content="End-to-end encrypted." name="description">';

    expect(
      whats(
        describedAs(html).flatMap((said) => unlabelledClaims("seeded", said))
      )
    ).toEqual(['says "End-to-end" out of sight of the caveat']);
  });
});

describe("fragment access", () => {
  it.each([
    {
      path: "apps/web/src/compose/receipt.tsx",
      text: "const t = location.hash",
    },
    { path: "apps/web/src/watch/memory.tsx", text: "const t = url.hash" },
    {
      path: "apps/web/src/lib/links.ts",
      text: "history.replaceState(null, '', url)",
    },
    // The two a narrower pattern walked straight past.
    {
      path: "apps/web/src/ui/copy-row.tsx",
      text: 'const bare = link.split("#")[0]',
    },
    { path: "apps/web/src/lib/utils.ts", text: "const here = location.href" },
  ])("catches $path", (file) => {
    expect(whats(strayFragmentReaders([file]))).toEqual([
      expect.stringContaining("touches the url fragment"),
    ]);
  });

  it("leaves the reveal boundary alone", () => {
    const file = {
      path: "apps/web/src/reveal/open-secret.ts",
      text: "const encoded = from.hash.slice(1)\nwindow.history.replaceState(null, '', url)",
    };

    expect(strayFragmentReaders([file])).toEqual([]);
  });

  it("leaves the one place that cuts a key out of a link alone", () => {
    const file = {
      path: "apps/web/src/watch/statuses.ts",
      text: 'shown: link.shown.split("#")[0] ?? link.shown,',
    };

    expect(strayFragmentReaders([file])).toEqual([]);
  });

  it("leaves a comment about the fragment alone", () => {
    const file = {
      path: "apps/web/src/compose/seal-and-send.ts",
      text: "/* It goes into the link, after the hash. Never location.hash here. */",
    };

    expect(strayFragmentReaders([file])).toEqual([]);
  });
});

describe("the environment", () => {
  const ENV_MODULE = ["apps/api/src/env.ts"];

  it("reads the names out of a destructure", () => {
    const source =
      "const {\n  DATABASE_URL,\n  MAX_TOTAL_BYTES,\n} = process.env;";

    expect(variablesRead(source)).toEqual(["DATABASE_URL", "MAX_TOTAL_BYTES"]);
  });

  it("reads a commented default as documented", () => {
    const example = "DATABASE_URL=postgres://x\n# MAX_TOTAL_BYTES=10485760\n";

    expect(documentedVariables(example)).toEqual(
      new Set(["DATABASE_URL", "MAX_TOTAL_BYTES"])
    );
  });

  it("catches a knob nobody wrote down", () => {
    const documented = documentedVariables("DATABASE_URL=postgres://x\n");

    expect(
      whats(undocumentedVariables(["DATABASE_URL", "SECRET_KNOB"], documented))
    ).toEqual(["SECRET_KNOB is read but not in .env.example"]);
  });

  it("catches the environment being read somewhere else", () => {
    const file = {
      path: "apps/api/src/secrets/create.ts",
      text: "const cap = Number(process.env.CAP)",
    };

    expect(whats(strayEnvReaders([file], ENV_MODULE))).toEqual([
      expect.stringContaining("reads the environment"),
    ]);
  });

  it("leaves the one module that validates it alone", () => {
    const file = {
      path: "apps/api/src/env.ts",
      text: "const { DATABASE_URL } = process.env;",
    };

    expect(strayEnvReaders([file], ENV_MODULE)).toEqual([]);
  });
});

describe("repository destinations", () => {
  it("finds the path a blob link points at", () => {
    const urls = [
      "https://github.com/devosurf/securesend/blob/main/docs/self-hosting.md",
      "https://github.com/devosurf/securesend/tree/main/packages/crypto",
    ];

    expect(repositoryDestinations(urls)).toEqual([
      "docs/self-hosting.md",
      "packages/crypto",
    ]);
  });

  it("ignores what is not a path in this repository", () => {
    const urls = [
      "https://github.com/devosurf/securesend",
      "mailto:security@securesend.dev",
    ];

    expect(repositoryDestinations(urls)).toEqual([]);
  });
});

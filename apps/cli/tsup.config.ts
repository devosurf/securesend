import { defineConfig } from "tsup";

export default defineConfig({
  /* The one line that makes the file a command rather than a module. tsup marks
   * the output executable when it finds it. */
  banner: { js: "#!/usr/bin/env node" },
  clean: true,
  dts: false,
  entry: ["src/cli.ts"],
  format: ["esm"],
  /*
   * The skill document goes into the bundle as a string, so `securesend skill`
   * prints the file this repository ships rather than looking for a copy of it
   * on a stranger's disk.
   */
  loader: { ".md": "text" },
  /*
   * The crypto package is bundled rather than left as a dependency to resolve.
   * It is workspace source, and this package publishes to npm under a name with
   * no scope: an installed `securesend` that reached for `@securesend/crypto`
   * would be reaching for something the registry does not have.
   */
  noExternal: [/^@securesend\//],
  platform: "node",
  target: "node22",
});

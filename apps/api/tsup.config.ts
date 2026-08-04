import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  /*
   * The crypto package goes into the bundle rather than staying a dependency to
   * resolve at runtime. It is workspace source, which tsup would otherwise leave as a
   * bare import the way it leaves every other dependency, and the container's runtime
   * stage installs only the api's production dependencies: a workspace link there
   * points at a `packages/` directory that stage never receives.
   */
  noExternal: [/^@securesend\//],
  platform: "node",
  target: "node22",
});

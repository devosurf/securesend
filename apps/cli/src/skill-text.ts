import document from "../../../skills/securesend/SKILL.md";

/*
 * The skill document, inlined at build time.
 *
 * `securesend skill` exists so an agent can read the rules of the road out of
 * the binary it is already running. A second copy of those rules is a copy that
 * goes stale, so this is the repository's own file, put into the bundle by the
 * text loader. There is no file to find at runtime and no way for the two to
 * disagree.
 */
export const skillText: string = document;

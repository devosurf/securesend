/**
 * Markdown arrives as a string. The bundler's text loader and the test runner's
 * mirror of it both produce exactly that, so a document imported anywhere in this
 * package is the document itself rather than a path to go and find.
 */
declare module "*.md" {
  const text: string;
  export default text;
}

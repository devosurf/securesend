import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { routeTree } from "./routeTree.gen";

/*
 * The build's second pass renders the static pages to HTML.
 *
 * Two reasons, and the first one is the product's. The security page's whole
 * argument is that you can check it instead of believing it, and "view source and
 * count" has to mean something when the counting happens in a reader's browser
 * with a curl in the other window. A page whose body arrives as a script tag
 * cannot make that offer. The second is ordinary: these two pages have no data
 * behind them, so shipping them as markup means the words paint before any
 * JavaScript runs.
 *
 * Static markup, not markup to hydrate, and that is deliberate rather than a
 * shortcut. The router renders a different tree on a server than in a browser: it
 * skips its own suspense boundary and its transitioner when there is no document.
 * Hydration therefore cannot match, and the only ways to force it are to reach
 * into router internals. So the pages ship without hydration markers and the
 * client renders over them. The markup's job is to be read, by a crawler, by a
 * curl, and by the first paint; the app takes the page from there.
 *
 * Secret routes are deliberately not prerendered. /s/:id is client-rendered, so
 * the fragment stays in the browser and the page carries no id in its markup.
 */
export async function render(path: string): Promise<string> {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree,
  });

  await router.load();

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

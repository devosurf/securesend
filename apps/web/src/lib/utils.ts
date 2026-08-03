import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * tailwind-merge has to be told about this project's type scale.
 *
 * Out of the box it recognises `text-base` and arbitrary lengths as font sizes
 * and treats every other `text-*` as a colour. Our scale is named, so it read
 * `text-body`, `text-small` and `text-meta` as colours and dropped whichever of
 * the pair came first:
 *
 *   twMerge("font-sans text-body text-ink-muted")  ->  "font-sans text-ink-muted"
 *   twMerge("text-ink-muted", "text-small")        ->  "text-small"
 *
 * The second line is the one that showed: every quiet link that also set a size
 * lost its muted colour and inherited full-strength ink, so quiet links were
 * rendering as loud ones. Naming the scale here fixes it for every consumer at
 * once.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "display-sm", "heading", "body", "small", "meta"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

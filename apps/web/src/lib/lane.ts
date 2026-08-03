import { useEffect, useState } from "react";
import { DESK_WIDTH } from "../ui/density";

/**
 * Which lane the reader is in.
 *
 * It is a media query read in an effect, so it is only ever right after the first
 * paint. That is why nothing in a page's build-time markup may depend on it: a
 * control that is on screen before anybody presses anything gets its two sizes from a
 * media query in CSS instead. What this is for is everything that cannot exist until
 * something has happened, which is every row an envelope grows, the whole receipt, and
 * the recipient's screens after the link has been looked up. By the time one of those
 * is on screen this has long since settled.
 *
 * True first, because the desk arrangement is the one the prerendered pages ship.
 */
export function useAtDesk(): boolean {
  const [atDesk, setAtDesk] = useState(true);

  useEffect(() => {
    const query = window.matchMedia(DESK_WIDTH);
    const settle = () => setAtDesk(query.matches);

    settle();
    query.addEventListener("change", settle);
    return () => query.removeEventListener("change", settle);
  }, []);

  return atDesk;
}

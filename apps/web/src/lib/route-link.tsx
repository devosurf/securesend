import { createLink } from "@tanstack/react-router";
import { TextLink } from "../ui/text-link";

/*
 * The quiet link's look, worn by a real router link.
 *
 * An action is a button and a destination is a link, even when they look
 * identical, and an internal destination is a link the router handles rather than
 * a page load. This is that pairing in one place, so no screen has to choose
 * between the right tag and the right look.
 *
 * Navigations carry a View Transition. Between the homepage and the security page
 * the vocabulary names no move, so this is the plain crossfade transitions.css
 * gives an unnamed walk. The named moves belong to the walks through the one job:
 * create to link, link to reveal.
 */
export const RouteLink = createLink(TextLink);

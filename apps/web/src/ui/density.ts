/*
 * How big a control's hit area is, in the three answers this interface needs.
 *
 * The rule every control here follows: padding grows, type does not. A touch
 * surface stays as quiet and dense as the pointer one, so growing a target never
 * turns the product into the fat, rounded mobile UI it is trying not to be.
 *
 *   default      a cursor
 *   touch        a finger
 *   responsive   a finger below the desk width and a cursor at it
 *
 * The third exists because the canvas designs a lane per frame and this app is one
 * page serving both. A control that is only ever on screen after the sender has
 * pressed something can be handed `default` or `touch` outright, since the lane is
 * known by then. A control that is in the page's first paint cannot: the homepage
 * is rendered to HTML at build time, before there is a screen to measure, so its
 * two sizes have to be a media query rather than a decision.
 */
export type Density = "default" | "touch" | "responsive";

/** The desk step of the scale, which is Tailwind's `md`. */
export const DESK_WIDTH = "(min-width: 768px)";

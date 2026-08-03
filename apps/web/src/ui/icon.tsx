import type { ReactNode, SVGProps } from "react";
import { cn } from "../lib/utils";

/*
 * The whole icon set, drawn on one 16px grid at one stroke weight.
 *
 * There is no icon library here and there should not be: the product needs about
 * ten glyphs and a library would bring a second drawing style with it, plus a
 * dependency on a page whose pitch is how little it loads. Everything here is
 * stroked in currentColor, so an icon takes its colour from the token on the
 * text around it and can never carry a hue the accent rules did not sanction.
 */

export type IconName =
  | "arrow-right"
  | "check"
  | "chevron-down"
  | "clock"
  | "copy"
  | "download"
  | "eye"
  | "eye-off"
  | "lock"
  | "paperclip"
  | "plus"
  | "share"
  | "x";

const GLYPHS: Record<IconName, ReactNode> = {
  "arrow-right": <path d="M2.5 8h11M9.5 4l4 4-4 4" />,
  check: <path d="M3 8.4 6.4 11.8 13 4.6" />,
  "chevron-down": <path d="M4 6.5 8 10.5 12 6.5" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 4.75V8.3l2.2 1.3" />
    </>
  ),
  copy: (
    <>
      <rect height="7.5" rx="1.5" width="7.5" x="6" y="6" />
      <path d="M10 6V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v4.5A1.5 1.5 0 0 0 4 10h2" />
    </>
  ),
  download: (
    <>
      <path d="M8 2.25v7.5M5.1 7.1 8 10l2.9-2.9" />
      <path d="M2.5 11.25v1.1A1.4 1.4 0 0 0 3.9 13.75h8.2a1.4 1.4 0 0 0 1.4-1.4v-1.1" />
    </>
  ),
  eye: (
    <>
      <path d="M1.5 8S4.2 3.6 8 3.6 14.5 8 14.5 8 11.8 12.4 8 12.4 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="1.9" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M6.4 3.85A6.6 6.6 0 0 1 8 3.6c3.8 0 6.5 4.4 6.5 4.4a12.6 12.6 0 0 1-2.1 2.66M3.75 5.1A12.4 12.4 0 0 0 1.5 8S4.2 12.4 8 12.4a6.6 6.6 0 0 0 2.2-.38" />
      <path d="M2.6 2.6 13.4 13.4" />
    </>
  ),
  lock: (
    <>
      <rect height="6.6" rx="1.5" width="10" x="3" y="7.15" />
      <path d="M5.6 7.15V5.3a2.4 2.4 0 0 1 4.8 0v1.85" />
    </>
  ),
  paperclip: (
    <path d="M12.4 7.6 7.5 12.5a2.9 2.9 0 0 1-4.1-4.1l5.3-5.3a1.9 1.9 0 0 1 2.7 2.7l-5.2 5.2a.9.9 0 0 1-1.3-1.3l4.7-4.7" />
  ),
  plus: <path d="M8 3.4v9.2M3.4 8h9.2" />,
  /* The system share glyph, drawn on our grid rather than borrowed: this is the
   * one action in the product that hands off to the device itself, and a phone
   * user reads this shape faster than any word we could put beside it. */
  share: (
    <>
      <path d="M8 2.2v7.6M5.4 4.8 8 2.2l2.6 2.6" />
      <path d="M5.1 6.9H3.8A1.4 1.4 0 0 0 2.4 8.3v4.1a1.4 1.4 0 0 0 1.4 1.4h8.4a1.4 1.4 0 0 0 1.4-1.4V8.3a1.4 1.4 0 0 0-1.4-1.4h-1.3" />
    </>
  ),
  x: <path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" />,
};

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  size?: number;
};

export function Icon({ name, size = 14, className, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0", className)}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.4}
      viewBox="0 0 16 16"
      width={size}
      {...props}
    >
      {GLYPHS[name]}
    </svg>
  );
}

import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../lib/utils";
import { SETTLE_MS } from "./collapse";
import { FloatLayer } from "./float-layer";

/*
 * A floating layer that also takes the page hostage.
 *
 * The separation is FloatLayer's job and the tokens'. What this adds is
 * modality, and modality is one thing: the scrim. --float-scrim is a near-black
 * wash over everything behind, and it is here rather than in FloatLayer on
 * purpose, because a scrim is not how a surface says "I am above you", it is how
 * a surface says "nothing else is available". A menu floats and must never dim
 * the page. A confirmation floats and must.
 *
 * Two placements, because a phone and a desk disagree about where a modal
 * belongs and about nothing else. Centred is the desk. Docked to the bottom edge
 * is the phone, where a centred layer puts its actions in the middle of the
 * screen and a thumb cannot reach them. Both are the same component with the
 * same trap, the same escape, and the same arrival.
 *
 * Keyboard, because a dialog that traps the eye and not the tab key is not a
 * dialog:
 *
 *   on open   focus goes to initialFocus, and for a destructive confirmation the
 *             caller points that at the SAFE choice, so a stray Enter cannot
 *             destroy anything
 *   Tab       cycles inside, both directions
 *   Escape    dismisses, which is the same as choosing to keep
 *
 * Clicking the scrim does nothing. Everywhere else a scrim click is a cheap
 * cancel, but this dialog's whole reason to exist is that the sender has to say
 * which of two things they meant, and a stray click is not an answer.
 */

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  placement = "center",
  labelledBy,
  describedBy,
  initialFocus,
  onDismiss,
  children,
  className,
}: {
  open: boolean;
  /** Centred is the desk. Sheet docks to the bottom edge, for a thumb. */
  placement?: "center" | "sheet";
  labelledBy: string;
  describedBy?: string;
  /** Point this at the safe choice. See above. */
  initialFocus?: RefObject<HTMLElement | null>;
  onDismiss?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return () => undefined;
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // First paint is the pre-arrival state, so a dialog mounted open still plays
  // its arrival. Two frames, because one lands inside the same commit.
  useEffect(() => {
    if (!(mounted && open)) {
      return () => undefined;
    }
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [mounted, open]);

  useEffect(() => {
    if (!(mounted && open)) {
      return;
    }
    const surface = surfaceRef.current;
    // A child that focuses itself on mount (a choice list opening on its current
    // value) has already answered this; do not take it back.
    if (surface?.contains(document.activeElement)) {
      return;
    }
    (initialFocus?.current ?? surface)?.focus({ preventScroll: true });
  }, [mounted, open, initialFocus]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      onDismiss?.();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const items = Array.from(
      surfaceRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
    );
    const first = items.at(0);
    const last = items.at(-1);
    if (!(first && last)) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!mounted) {
    return null;
  }

  const sheet = placement === "sheet";

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex",
        sheet ? "items-end" : "items-center justify-center p-6"
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 transition-opacity duration-[var(--duration-quick)] [background:var(--float-scrim)] motion-reduce:transition-none",
          shown ? "opacity-100" : "opacity-0"
        )}
      />
      <FloatLayer
        aria-describedby={describedBy}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={cn(
          "relative",
          sheet ? "w-full rounded-b-none border-b-0" : "w-full max-w-[440px]",
          className
        )}
        onKeyDown={handleKeyDown}
        ref={surfaceRef}
        role="dialog"
        shown={shown}
        tabIndex={-1}
      >
        {children}
      </FloatLayer>
    </div>
  );
}

import { type KeyboardEvent, type RefObject, useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { FloatLayer } from "./float-layer";
import { Icon } from "./icon";

/*
 * A short list of values, floating, anchored to the control that opened it.
 *
 * **It opens upward.** The expiry strip is the last row of the create panel, so
 * down was always the wrong direction: a menu hanging below it escapes the
 * panel's bottom edge and forces the panel to give up its own `overflow-hidden`.
 * Up opens into the panel's own body, inside the clip. `placement="down"` exists
 * for a trigger that is not at the bottom of something, and a caller that picks it
 * is claiming there is room.
 *
 * **The keyboard is all here.** Roving focus, arrow and Home/End handling,
 * outside-click dismissal, focus return. That cost is real and it is paid once, in
 * this file, for every menu the product ever grows. What is not acceptable is
 * paying it partly, which is a menu that looks finished and strands anyone not
 * using a mouse.
 *
 *   on open      focus lands on the current value, not the first option
 *   up / down    move focus, wrapping at both ends
 *   Home / End   first and last
 *   Enter/Space  the button's own behaviour, so nothing here intercepts it
 *   Escape       closes and hands focus back to the trigger
 *   Tab          closes and lets focus continue past the trigger, because a menu
 *                is not a dialog and must not hold the tab key hostage
 *
 * **No scrim, ever.** A scrim says nothing else is available, and it belongs to
 * Dialog alone: dimming the page to choose an expiry would say that picking 72
 * hours ranks with destroying a secret. Elevation is FloatLayer's border and ring,
 * and nothing more.
 *
 * Dismissal listens on `pointerdown` rather than rendering an invisible
 * full-screen button over the page. The button version is one more focusable thing
 * between the trigger and the list, in a control whose whole remaining cost is its
 * focus behaviour.
 */

export interface MenuOption {
  label: string;
  value: string;
}

const MOVEMENT_KEYS = ["ArrowDown", "ArrowUp", "Home", "End"];

export function Menu({
  open,
  options,
  value,
  onChange,
  onClose,
  label,
  placement = "up",
  density = "default",
  triggerRef,
  className,
}: {
  open: boolean;
  options: MenuOption[];
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  /** Names the list for a screen reader. The trigger's own text is not enough. */
  label: string;
  /** Up is the default. See above: down is a claim that there is room below. */
  placement?: "up" | "down";
  /* Same contract as every other control here: padding grows, type does not. A
   * default row is 25px tall, right for a cursor and much too small for a thumb,
   * so touch takes it to 33.
   *
   * Not to the 44 a standalone target wants, and the reason is a measured ceiling
   * rather than restraint. Opening upward means the menu has to fit between the
   * strip and the top of a panel that clips its own content, and on a phone the
   * space above the strip is the note field at its 132px floor. Three rows at 44
   * plus padding is about 150 and gets its top border shaved off; at 33 it fits
   * with room. So: **three options is the ceiling on a phone.** A fourth needs a
   * different control, not a tighter row. */
  density?: "default" | "touch";
  /* So Escape and a pick both put focus back where it came from. The trigger
   * belongs to the caller, so the caller passes it rather than this reaching into
   * the DOM to guess which element opened it. */
  triggerRef?: RefObject<HTMLElement | null> | undefined;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Focus the current value, so opening the menu on 24h and pressing down once
  // means 72h rather than landing back on 1h.
  useEffect(() => {
    if (!open) {
      return;
    }
    const current = listRef.current?.querySelector<HTMLElement>(
      '[data-current="true"]'
    );
    (current ?? listRef.current?.querySelector<HTMLElement>("button"))?.focus({
      preventScroll: true,
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (listRef.current?.contains(target)) {
        return;
      }
      // A press on the trigger is the trigger's own toggle. Closing here too
      // would run both and reopen the menu on the same click.
      if (triggerRef?.current?.contains(target)) {
        return;
      }
      onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose, triggerRef]);

  function dismiss() {
    onClose();
    triggerRef?.current?.focus({ preventScroll: true });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" || event.key === "Tab") {
      // Tab is not prevented: the menu closes and focus carries on past the
      // trigger, which is what a menu does and a dialog does not.
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
      } else {
        onClose();
      }
      return;
    }

    if (!MOVEMENT_KEYS.includes(event.key)) {
      return;
    }
    event.preventDefault();

    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("button") ?? []
    );
    if (items.length === 0) {
      return;
    }
    const at = items.indexOf(document.activeElement as HTMLElement);
    const last = items.length - 1;
    let next = at;
    if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = last;
    } else if (event.key === "ArrowDown") {
      next = at >= last ? 0 : at + 1;
    } else {
      next = at <= 0 ? last : at - 1;
    }
    items[next]?.focus();
  }

  if (!open) {
    return null;
  }

  return (
    <FloatLayer
      aria-label={label}
      className={cn(
        "absolute left-0 z-30 min-w-full p-1",
        placement === "up" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        className
      )}
      onKeyDown={handleKeyDown}
      ref={listRef}
      role="menu"
      shown={true}
    >
      {options.map((option) => {
        const current = option.value === value;
        return (
          <button
            aria-checked={current}
            className={cn(
              "flex w-full items-center justify-between gap-4 whitespace-nowrap rounded-inner text-left font-medium font-sans text-[12.5px] transition-colors duration-[var(--duration-instant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
              density === "touch" ? "px-3 py-2.5" : "px-2.5 py-1.5",
              current
                ? "text-accent"
                : "text-ink-muted hover:bg-surface-raised hover:text-ink"
            )}
            data-current={current}
            key={option.value}
            onClick={() => {
              onChange(option.value);
              dismiss();
            }}
            role="menuitemradio"
            type="button"
          >
            {option.label}
            {/* The check is the only mark the chosen row gets. A filled accent row
             * would put a second solid teal block on a strip that already has the
             * Create button. */}
            {current ? <Icon name="check" size={12} /> : null}
          </button>
        );
      })}
    </FloatLayer>
  );
}

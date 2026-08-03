import type { ChangeEvent, ReactNode, RefObject } from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { TextInput } from "./field";
import { Icon } from "./icon";

/*
 * One editable part of a secret, on one line. The sender's twin of CopyRow: same
 * 92px label column, same padding, so a note plus a login plus a file still
 * reads as one letter with lines rather than a stack of form controls.
 *
 * The input is bare on purpose. It sits inside a panel that is already a field,
 * and a bordered input here would turn a growing envelope into a pile.
 *
 * The remove control rests at ink-faint and comes up to full ink on hover. It is
 * never hidden: a part you added must always show how to take it back, and a
 * control that only exists on hover cannot be reviewed as a state.
 *
 * The password is not masked while the sender types it. They are the one person
 * who is supposed to read it, they usually pasted it, and hiding it from them
 * only costs them the check that they pasted the right thing.
 *
 * --- the two phone affordances -------------------------------------------
 *
 * `layout="stacked"` and `density="touch"` are CopyRow's and FileRow's, for the
 * same reasons and by the same means, so the sender's rows and the recipient's
 * rows stay one grammar on both devices.
 *
 * Stacked matters more here than it does on the reading side. At 390 the 92px
 * label column leaves an input about nineteen mono characters wide, and the one
 * thing this row exists to let the sender do is check that what they pasted is
 * what they meant. A value they can only see a third of defeats the row. Label
 * above, value across the full width, so a pasted password is readable in one
 * look.
 *
 * `action` is a slot in the trailing cluster, beside remove, and it arrives as a
 * node for exactly the reason OptionsRow takes `expiry` and `action` as nodes: a
 * row that needs a tool on it needs that tool to own state, and state belongs to
 * the screen. The alternative was every create surface rebuilding this row around
 * one extra button, which is how a 92px label column drifts to 88px in one of
 * them.
 */
export function FieldRow({
  label,
  value,
  placeholder,
  onChange,
  onRemove,
  onFocus,
  onBlur,
  inputRef,
  action,
  layout = "row",
  density = "default",
  className,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onRemove?: () => void;
  /** A tool that belongs to this line. See above: it owns its own state. */
  action?: ReactNode;
  /* A surface that has to know where the caret is, to raise or lower its own
   * chrome around it, cannot ask the row: shared UI takes props, never
   * knowledge. So the row reports, and the screen decides. */
  onFocus?: () => void;
  onBlur?: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Stacked is the phone: the label sits above the value instead of beside it. */
  layout?: "row" | "stacked";
  /** Touch gives the remove control a finger-sized target at the same weight. */
  density?: "default" | "touch";
  className?: string;
}) {
  const touch = density === "touch";

  const remove = onRemove ? (
    <Button
      aria-label={`Remove ${label}`}
      className={cn("text-ink-faint", touch ? "px-2.5" : "-mr-1.5 px-2")}
      onClick={onRemove}
      size={touch ? "tap" : "sm"}
      variant="ghost"
    >
      <Icon name="x" size={13} />
    </Button>
  ) : null;

  /* One cluster, so a row with a tool on it keeps the tool and the remove
   * control on the same baseline and at the same distance from the edge. */
  const trailing =
    action || remove ? (
      <div className="flex items-center gap-0.5">
        {action}
        {remove}
      </div>
    ) : null;

  if (layout === "stacked") {
    return (
      <div className={cn("px-5 py-3.5", className)}>
        <div
          className={cn(
            "flex items-center justify-between gap-3",
            touch && "-my-2.5 -mr-3.5"
          )}
        >
          <span className="font-mono text-ink-faint text-meta lowercase">
            {label}
          </span>
          {trailing}
        </div>
        <TextInput
          className={cn(
            "w-full font-mono tracking-tight",
            touch ? "mt-1 py-1.5" : "mt-2"
          )}
          inputSize="md"
          onBlur={onBlur}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onChange(event.target.value)
          }
          onFocus={onFocus}
          placeholder={placeholder}
          ref={inputRef}
          value={value}
          variant="bare"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-2.5",
        className
      )}
    >
      <span className="font-mono text-ink-faint text-meta lowercase">
        {label}
      </span>
      <TextInput
        className="w-full font-mono tracking-tight"
        inputSize="md"
        onBlur={onBlur}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
        onFocus={onFocus}
        placeholder={placeholder}
        ref={inputRef}
        value={value}
        variant="bare"
      />
      {trailing ?? <span />}
    </div>
  );
}

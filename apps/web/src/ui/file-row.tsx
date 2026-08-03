import { cn } from "../lib/utils";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";

/*
 * An attachment, on the same line grammar as CopyRow, so a secret made of a note
 * plus a login plus a file still reads as one thing with parts rather than three
 * different components stacked up.
 *
 * The action is named by the side it is on: the sender removes, the recipient
 * downloads. Both are the same row.
 *
 * `density="touch"` is CopyRow's, for the same reason and by the same means:
 * finger-sized padding, unchanged type, negative margin to keep the row's rhythm.
 * A filename is the one value here that may truncate, because unlike a password
 * nobody has to retype it.
 */
export function FileRow({
  label,
  name,
  meta,
  actionIcon,
  actionLabel,
  onAction,
  onRemove,
  layout = "row",
  density = "default",
  className,
}: {
  label?: string;
  name: string;
  meta: string;
  actionIcon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  onRemove?: () => void;
  layout?: "row" | "stacked";
  density?: "default" | "touch";
  className?: string;
}) {
  const touch = density === "touch";

  const file = (
    <div className="flex min-w-0 items-center gap-2.5">
      <Icon className="text-ink-faint" name="paperclip" />
      <span className="truncate font-mono text-[14px] text-ink tracking-tight">
        {name}
      </span>
      <span className="shrink-0 font-mono text-ink-faint text-meta">
        {meta}
      </span>
    </div>
  );

  const action = (
    <div
      className={cn(
        "flex shrink-0 items-center",
        touch ? "-my-2.5 gap-0" : "-mr-1.5 gap-0.5"
      )}
    >
      {actionLabel ? (
        <Button
          className="gap-1.5"
          onClick={onAction}
          size={touch ? "tap" : "sm"}
          variant="ghost"
        >
          {actionIcon ? <Icon name={actionIcon} /> : null}
          {actionLabel}
        </Button>
      ) : null}
      {onRemove ? (
        <Button
          aria-label={`Remove ${name}`}
          className={cn("text-ink-faint", touch ? "px-2.5" : "px-2")}
          onClick={onRemove}
          size={touch ? "tap" : "sm"}
          variant="ghost"
        >
          <Icon name="x" size={13} />
        </Button>
      ) : null}
    </div>
  );

  if (layout === "stacked") {
    return (
      <div className={cn("px-5 py-4", className)}>
        <div
          className={cn(
            "flex items-center justify-between gap-3",
            touch && "-mr-3.5"
          )}
        >
          <span className="font-mono text-ink-faint text-meta lowercase">
            {label ?? "file"}
          </span>
          {action}
        </div>
        <div className="mt-2">{file}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-3.5",
        className
      )}
    >
      <span className="font-mono text-ink-faint text-meta lowercase">
        {label ?? "file"}
      </span>
      {file}
      {action}
    </div>
  );
}

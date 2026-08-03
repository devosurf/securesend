import { cn } from "../lib/utils";

/*
 * The active option is a solid accent fill, not an outline: an outlined active
 * state is too quiet to find at a glance.
 */
export interface SegmentedOption {
  label: string;
  value: string;
}

export function Segmented({
  options,
  value,
  onChange,
  label,
  density = "default",
  className,
}: {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  /* Touch grows the segments by padding only, like every other control in this
   * system: the type does not move, so a phone strip stays as dense and quiet as
   * the desk one. */
  density?: "default" | "touch";
  className?: string;
}) {
  const touch = density === "touch";

  return (
    /* A fieldset rather than a div with role="group": it is the element the role
     * exists to describe, and Tailwind's reset already takes away the border and
     * padding a fieldset would otherwise bring. */
    <fieldset
      aria-label={label}
      className={cn(
        "inline-flex rounded-control border border-hairline bg-surface-sunken p-0.5",
        className
      )}
    >
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={cn(
            "rounded-inner font-medium font-sans text-[11.5px] transition-colors duration-[var(--duration-instant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-sunken",
            touch ? "px-3.5 py-2" : "px-2.5 py-1",
            value === option.value
              ? "bg-accent text-accent-ink"
              : "text-ink-muted hover:text-ink"
          )}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

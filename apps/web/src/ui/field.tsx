import { cva } from "class-variance-authority";
import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from "react";
import { cn } from "../lib/utils";

/*
 * The caret is accent-coloured on every editable surface in the product. It is
 * the smallest possible signal that a field is live, and it costs nothing.
 *
 * 16px is not a taste decision. Anything smaller and iOS zooms the page when the
 * caret lands in it, which on the create surface would scale a carefully
 * measured layout the moment the sender starts working.
 *
 * The ref is spelled out rather than inherited, because a surface with a hard
 * height budget has to be able to size this field to its content instead of
 * reserving room it may not need.
 */

export type SecretAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement> | undefined;
};

export function SecretArea({ className, ref, ...props }: SecretAreaProps) {
  return (
    <textarea
      className={cn(
        "w-full resize-none bg-transparent font-sans text-[16px] text-ink leading-relaxed caret-accent placeholder:text-ink-faint focus:outline-none",
        className
      )}
      ref={ref}
      {...props}
    />
  );
}

/*
 * Two shapes of input, because the product asks for text in two places.
 *
 *   boxed  a field on a form: it has to look like somewhere to type
 *   bare   a value on a line inside a surface that is already a field. The
 *          envelope grows by adding lines, and a line that boxes itself turns a
 *          growing envelope into a pile of form controls.
 *
 * `size` is taken by the HTML attribute, so the prop is `inputSize`.
 */
const textInputVariants = cva(
  "font-sans text-ink caret-accent outline-none transition-colors duration-[var(--duration-quick)] placeholder:text-ink-faint",
  {
    compoundVariants: [
      { class: "px-2.5 py-1.5", inputSize: "sm", variant: "boxed" },
      { class: "px-3 py-2.5", inputSize: "md", variant: "boxed" },
    ],
    defaultVariants: { inputSize: "sm", variant: "boxed" },
    variants: {
      inputSize: {
        md: "text-[14px]",
        sm: "text-[11.5px]",
      },
      variant: {
        bare: "border-0 bg-transparent px-0 py-0",
        boxed:
          "rounded-control border border-hairline bg-surface focus:border-accent/70",
      },
    },
  }
);

/*
 * The variants are spelled out rather than lifted off cva with VariantProps:
 * VariantProps resolves to a union (cva's ClassProp is one), and intersecting a
 * union with InputHTMLAttributes loses contextual typing, so every inline
 * onChange handler on this input would silently become `any`.
 */
export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: "boxed" | "bare" | undefined;
  inputSize?: "sm" | "md" | undefined;
  /* Spelled out rather than inherited, because a field that is added while the
   * surface is open has to be able to take focus the moment it lands. */
  ref?: Ref<HTMLInputElement> | undefined;
};

export function TextInput({
  className,
  variant,
  inputSize,
  ref,
  ...props
}: TextInputProps) {
  return (
    <input
      className={cn(textInputVariants({ inputSize, variant }), className)}
      ref={ref}
      {...props}
    />
  );
}

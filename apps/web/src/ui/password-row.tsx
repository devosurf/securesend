import { type Ref, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { TextInput } from "./field";
import { Icon } from "./icon";

/*
 * The seal from the recipient's side: the one row standing between a
 * password-protected envelope and the press that spends it.
 *
 * It carries no label, and that is why it is its own component rather than a
 * FieldRow with a different word in it. The envelope may well contain a
 * credential called "password", so a row labelled `password` would be ambiguous
 * about which one has to be typed the moment the secret opened. A lock and a
 * placeholder naming whose password it is do the whole job, and then no label can
 * disagree with the one inside the letter.
 *
 * Masked, unlike the sender's own field, because this is somebody else's password
 * and the recipient is often on a shared screen. Show is CopyRow's control down
 * to the glyphs, because "is that what I typed" is a real question when the thing
 * you are about to press cannot be pressed twice. The shown state lives here for
 * the same reason CopyRow's does: it is what the widget feels, not something the
 * screen knows.
 *
 * It sits on the sunken ground, the same ground the create surface gives the
 * sender's password. Both sides of one feature, one ground, and the seal is never
 * on the same lines as the letter.
 *
 * `density="touch"` is the phone: Show's hit area grows by padding and a negative
 * margin pulls it back, so the row keeps the height it has on a desk and a finger
 * still finds it.
 */
export function PasswordRow({
  value,
  onChange,
  placeholder,
  inputRef,
  density = "default",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /* So a screen that puts the caret here on arrival can, without reaching into
   * the DOM to find it. */
  inputRef?: Ref<HTMLInputElement> | undefined;
  density?: "default" | "touch";
  className?: string;
}) {
  const [shown, setShown] = useState(false);
  const touch = density === "touch";

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-hairline border-t bg-surface-sunken px-5 py-2.5",
        className
      )}
    >
      <Icon className="text-ink-faint" name="lock" />
      <TextInput
        className={cn(
          "min-w-0 flex-1 font-mono tracking-tight",
          touch && "-my-1 py-1"
        )}
        inputSize="md"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        ref={inputRef}
        type={shown ? "text" : "password"}
        value={value}
        variant="bare"
      />
      <Button
        aria-label={shown ? "Hide" : "Show"}
        className={cn("gap-1.5", touch ? "-my-2.5 -mr-3.5" : "-mr-1.5")}
        onClick={() => setShown(!shown)}
        size={touch ? "tap" : "sm"}
        variant="ghost"
      >
        <Icon name={shown ? "eye-off" : "eye"} />
        {shown ? "Hide" : "Show"}
      </Button>
    </div>
  );
}

import { Field } from "@base-ui/react/field";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { Ref } from "react";

export type SwitchProps = {
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  name?: string;
  disabled?: boolean;
  ref?: Ref<HTMLElement>;
};

/** A settings row: the label on the left (it toggles too), the switch on the right. */
export function Switch({ label, disabled, onCheckedChange, ...props }: SwitchProps) {
  return (
    <Field.Root disabled={disabled} className="flex items-center gap-4">
      <Field.Label className="flex-1 cursor-pointer py-2 text-body text-ink data-disabled:cursor-not-allowed">
        {label}
      </Field.Label>
      <BaseSwitch.Root
        {...props}
        // Drops Base UI's event details so the public callback is just the new state.
        onCheckedChange={(checked) => onCheckedChange?.(checked)}
        className="flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-pill border-2 border-line bg-subtle p-1 focus-visible:focus-ring data-checked:bg-primary"
      >
        <BaseSwitch.Thumb className="size-5 rounded-pill border-2 border-line bg-paper data-checked:translate-x-5 motion-safe:transition-transform motion-safe:duration-ui motion-safe:ease-ui" />
      </BaseSwitch.Root>
    </Field.Root>
  );
}

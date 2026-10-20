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

export function Switch({ label, disabled, onCheckedChange, ...props }: SwitchProps) {
  return (
    <Field.Root disabled={disabled} className="flex items-center gap-4">
      <Field.Label className="flex-1 cursor-pointer py-2 text-body text-ink data-disabled:cursor-not-allowed">
        {label}
      </Field.Label>
      <BaseSwitch.Root
        {...props}
        onCheckedChange={(checked) => onCheckedChange?.(checked)}
        className="group flex min-h-11 w-12 shrink-0 cursor-pointer items-center rounded-full data-disabled:cursor-not-allowed data-disabled:opacity-50"
      >
        <span className="flex h-7 w-12 items-center rounded-full border border-line-strong bg-subtle p-0.5 group-data-checked:border-primary group-data-checked:bg-primary motion-safe:transition-colors motion-safe:duration-ui">
          <BaseSwitch.Thumb className="size-5 rounded-full bg-muted shadow-card data-checked:translate-x-5.5 data-checked:bg-on-primary motion-safe:transition-transform motion-safe:duration-ui motion-safe:ease-ui" />
        </span>
      </BaseSwitch.Root>
    </Field.Root>
  );
}

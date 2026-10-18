import { Select as BaseSelect } from "@base-ui/react/select";
import { CaretDown, Check } from "@phosphor-icons/react";
import type { Ref } from "react";
import { fieldControlClasses, fieldLabelClasses, type ChoiceOption } from "./Field";

export type SelectProps = {
  label: string;
  options: readonly ChoiceOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function Select({ label, options, onValueChange, ref, ...props }: SelectProps) {
  return (
    <BaseSelect.Root {...props} items={options} onValueChange={(value) => onValueChange?.(value as string)}>
      <div className="flex flex-col gap-2">
        <BaseSelect.Label className={fieldLabelClasses}>{label}</BaseSelect.Label>
        <BaseSelect.Trigger ref={ref} className={`${fieldControlClasses} flex items-center justify-between gap-2`}>
          <BaseSelect.Value />
          <BaseSelect.Icon render={<CaretDown />} />
        </BaseSelect.Trigger>
      </div>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="z-overlay" sideOffset={4}>
          <BaseSelect.Popup className="max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-md border-2 border-line bg-paper py-1 text-ink shadow-press data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:transition-opacity motion-safe:duration-ui motion-safe:ease-ui">
            <BaseSelect.List>
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  className="flex min-h-target cursor-default items-center justify-between gap-4 px-3 py-2 text-body data-highlighted:bg-primary-soft"
                >
                  <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator render={<Check />} />
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

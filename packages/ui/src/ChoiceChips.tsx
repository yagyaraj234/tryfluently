import { Checkbox } from "@base-ui/react/checkbox";
import { CheckboxGroup } from "@base-ui/react/checkbox-group";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Check } from "@phosphor-icons/react";
import { useId, type Ref } from "react";
import { fieldLabelClasses, type ChoiceOption } from "./Field";

type CommonProps = {
  label: string;
  options: readonly ChoiceOption[];
  name?: string;
  layout?: "chips" | "cards" | "segmented";
  disabled?: boolean;
  ref?: Ref<HTMLDivElement>;
};

export type ChoiceChipsProps = CommonProps &
  (
    | {
        multiple?: false;
        value?: string | null;
        defaultValue?: string;
        onValueChange?: (value: string) => void;
      }
    | {
        multiple: true;
        value?: string[];
        defaultValue?: string[];
        onValueChange?: (value: string[]) => void;
      }
  );

const chip =
  "inline-flex cursor-pointer items-center gap-2 min-h-11 rounded-full border border-line-strong bg-paper px-4 py-2 text-caption text-ink data-checked:border-primary data-checked:bg-primary-soft data-disabled:cursor-not-allowed data-disabled:opacity-50 motion-safe:transition motion-safe:duration-press motion-safe:ease-press motion-safe:not-data-disabled:active:scale-97";

const optionsLayouts = {
  cards: "grid gap-4",
  segmented: "inline-flex max-w-full flex-wrap gap-1 self-start rounded-2xl bg-subtle p-1",
  chips: "flex flex-wrap gap-2",
};

const optionLayouts = {
  cards:
    "flex min-h-24 w-full cursor-pointer items-center gap-4 rounded-2xl border border-line-strong bg-paper p-5 text-left text-body text-ink shadow-card data-checked:border-ink data-checked:bg-primary-soft data-disabled:cursor-not-allowed motion-safe:transition motion-safe:duration-press motion-safe:ease-press motion-safe:not-data-disabled:active:scale-97",
  segmented:
    "inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-xl px-4 py-2 text-caption font-medium whitespace-nowrap text-muted data-checked:bg-paper data-checked:text-ink data-checked:shadow-card data-disabled:cursor-not-allowed data-disabled:opacity-50 motion-safe:transition motion-safe:duration-press motion-safe:ease-press motion-safe:not-data-disabled:active:scale-98",
  chips: chip,
};

export function ChoiceChips(props: ChoiceChipsProps) {
  const labelId = useId();
  const { label, options, name, disabled, ref, layout = "chips" } = props;
  const segmented = layout === "segmented";
  const optionsClasses = optionsLayouts[layout];
  const optionClasses = optionLayouts[layout];
  const content = (option: ChoiceOption) => (
    <span className="flex flex-col gap-1">
      <span className="font-medium">{option.label}</span>
      {option.description && <span className="text-caption font-normal text-muted">{option.description}</span>}
    </span>
  );
  const groupProps = { ref, disabled, "aria-labelledby": labelId, className: "flex flex-col gap-2" };
  const heading = (
    <div id={labelId} className={fieldLabelClasses}>
      {label}
    </div>
  );

  if (props.multiple) {
    return (
      <CheckboxGroup
        {...groupProps}
        value={props.value}
        defaultValue={props.defaultValue}
        onValueChange={(value) => props.onValueChange?.(value)}
      >
        {heading}
        <div className={optionsClasses}>
          {options.map((option) => (
            // CheckboxGroup has no `name`; each checkbox submits its own value under it.
            <Checkbox.Root key={option.value} name={name} value={option.value} className={optionClasses}>
              <Checkbox.Indicator className="shrink-0" render={<Check aria-hidden />} />
              {content(option)}
            </Checkbox.Root>
          ))}
        </div>
      </CheckboxGroup>
    );
  }

  return (
    <RadioGroup
      {...groupProps}
      name={name}
      value={props.value}
      defaultValue={props.defaultValue}
      onValueChange={(value) => props.onValueChange?.(value as string)}
    >
      {heading}
      <div className={optionsClasses}>
        {options.map((option) => (
          <Radio.Root key={option.value} value={option.value} className={optionClasses}>
            {!segmented && <Radio.Indicator className="shrink-0" render={<Check aria-hidden />} />}
            {content(option)}
          </Radio.Root>
        ))}
      </div>
    </RadioGroup>
  );
}

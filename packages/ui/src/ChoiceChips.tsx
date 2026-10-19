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
  layout?: "chips" | "cards";
  disabled?: boolean;
  ref?: Ref<HTMLDivElement>;
};

export type ChoiceChipsProps = CommonProps &
  (
    | {
        multiple?: false;
        /** `null` means nothing is picked yet (still controlled). */
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
  "inline-flex cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-paper px-4 py-2 text-body text-ink data-checked:border-primary data-checked:bg-primary-soft data-disabled:cursor-not-allowed";

/** Single choice is a radio group (arrow keys move and select); `multiple` is a group of checkboxes. */
export function ChoiceChips(props: ChoiceChipsProps) {
  const labelId = useId();
  const { label, options, name, disabled, ref, layout = "chips" } = props;
  const card = layout === "cards";
  const optionClasses = card ? "flex min-h-24 w-full cursor-pointer items-center gap-4 rounded-2xl border border-line-strong bg-paper p-5 text-left text-body text-ink shadow-card data-checked:border-ink data-checked:bg-primary-soft data-disabled:cursor-not-allowed" : chip;
  const content = (option: ChoiceOption) => <span className="flex flex-col gap-1"><span className="font-semibold">{option.label}</span>{option.description && <span className="text-caption font-normal text-muted">{option.description}</span>}</span>;
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
        <div className={card ? "grid gap-4" : "flex flex-wrap gap-2"}>
          {options.map((option) => (
            // CheckboxGroup has no `name`; each checkbox submits its own value under it.
            <Checkbox.Root key={option.value} name={name} value={option.value} className={optionClasses}>
              <Checkbox.Indicator render={<Check />} />
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
      <div className={card ? "grid gap-4" : "flex flex-wrap gap-2"}>
        {options.map((option) => (
          <Radio.Root key={option.value} value={option.value} className={optionClasses}>
            <Radio.Indicator render={<Check />} />
            {content(option)}
          </Radio.Root>
        ))}
      </div>
    </RadioGroup>
  );
}

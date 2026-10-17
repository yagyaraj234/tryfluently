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
  "inline-flex cursor-pointer items-center gap-2 rounded-pill border-2 border-line bg-paper px-4 py-2 text-body text-ink focus-visible:focus-ring data-checked:bg-primary-soft data-disabled:cursor-not-allowed";

/** Single choice is a radio group (arrow keys move and select); `multiple` is a group of checkboxes. */
export function ChoiceChips(props: ChoiceChipsProps) {
  const labelId = useId();
  const { label, options, name, disabled, ref } = props;
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
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            // CheckboxGroup has no `name`; each checkbox submits its own value under it.
            <Checkbox.Root key={option.value} name={name} value={option.value} className={chip}>
              <Checkbox.Indicator render={<Check />} />
              {option.label}
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
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Radio.Root key={option.value} value={option.value} className={chip}>
            <Radio.Indicator render={<Check />} />
            {option.label}
          </Radio.Root>
        ))}
      </div>
    </RadioGroup>
  );
}

import { Field } from "@base-ui/react/field";
import type { ComponentProps } from "react";
import { FieldShell, fieldControlClasses, type FieldShellProps } from "./Field";

export type TextAreaProps = FieldShellProps &
  Omit<ComponentProps<"textarea">, "className" | "style" | "children" | "value" | "defaultValue"> & {
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
  };

export function TextArea({ label, description, error, rows = 3, ...props }: TextAreaProps) {
  return (
    <FieldShell label={label} description={description} error={error}>
      {/* Field.Control is typed for <input>; it forwards everything to the textarea it renders. */}
      <Field.Control
        {...(props as ComponentProps<typeof Field.Control>)}
        render={<textarea rows={rows} />}
        className={`${fieldControlClasses} resize-y`}
      />
    </FieldShell>
  );
}

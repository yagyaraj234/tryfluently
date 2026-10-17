import { Input } from "@base-ui/react/input";
import type { ComponentProps } from "react";
import { FieldShell, fieldControlClasses, type FieldShellProps } from "./Field";

export type TextFieldProps = FieldShellProps & Omit<ComponentProps<typeof Input>, "className" | "style" | "render">;

export function TextField({ label, description, error, ...props }: TextFieldProps) {
  return (
    <FieldShell label={label} description={description} error={error}>
      <Input {...props} className={fieldControlClasses} />
    </FieldShell>
  );
}

import { Field } from "@base-ui/react/field";
import type { ReactNode } from "react";

export type ChoiceOption = { value: string; label: string; description?: string };

export const fieldLabelClasses = "text-caption font-medium text-ink";

export const fieldControlClasses =
  "min-h-11 w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2 text-body text-ink placeholder:text-muted";

export type FieldShellProps = {
  label: string;
  description?: string;
  error?: string;
};

export function FieldShell({ label, description, error, children }: FieldShellProps & { children: ReactNode }) {
  return (
    <Field.Root invalid={Boolean(error)} className="flex flex-col gap-2">
      <Field.Label className={fieldLabelClasses}>{label}</Field.Label>
      {children}
      {description && <Field.Description className="text-caption text-muted">{description}</Field.Description>}
      {error && (
        <Field.Error match role="alert" className="text-caption text-incorrect">
          {error}
        </Field.Error>
      )}
    </Field.Root>
  );
}

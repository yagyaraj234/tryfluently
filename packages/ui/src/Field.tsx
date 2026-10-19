// Internal parts shared by the form components. Not exported from the barrel (except ChoiceOption).
import { Field } from '@base-ui/react/field';
import type { ReactNode } from 'react';
import { textSizeClasses } from './Text';

export type ChoiceOption = { value: string; label: string; description?: string };

export const fieldLabelClasses = `${textSizeClasses.label} text-ink`;

// py-2 with body line height and the border clears the 44px touch target.
export const fieldControlClasses =
  'w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2 text-body text-ink placeholder:text-muted';

export type FieldShellProps = {
  label: string;
  description?: string;
  /** Marks the field invalid and is announced. */
  error?: string;
};

/** Label, description and error around one control, linked to it by Base UI's Field. */
export function FieldShell({
  label,
  description,
  error,
  children,
}: FieldShellProps & { children: ReactNode }) {
  return (
    <Field.Root invalid={Boolean(error)} className="flex flex-col gap-2">
      <Field.Label className={fieldLabelClasses}>{label}</Field.Label>
      {children}
      {description && (
        <Field.Description className="text-caption text-muted">{description}</Field.Description>
      )}
      {error && (
        <Field.Error match role="alert" className="text-caption text-incorrect">
          {error}
        </Field.Error>
      )}
    </Field.Root>
  );
}

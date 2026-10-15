import { Button as BaseButton } from "@base-ui/react/button";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ComponentProps, ReactElement } from "react";

/** The pressable key look shared by Button and IconButton: ink outline, offset shadow, and a press that sinks into it. */
export const pressable =
  "inline-flex items-center justify-center gap-2 rounded-md border-2 border-line font-bold shadow-press focus-visible:focus-ring motion-safe:transition motion-safe:duration-press motion-safe:ease-press not-data-disabled:active:shadow-none motion-safe:not-data-disabled:active:translate-press data-disabled:bg-subtle data-disabled:text-muted data-disabled:shadow-none";

const button = cva(`${pressable} min-h-target px-5 py-2 text-body`, {
  variants: {
    variant: { primary: "bg-primary text-on-primary", secondary: "bg-paper text-ink" },
    fullWidth: { true: "w-full" },
  },
});

export type ButtonProps = Omit<ComponentProps<"button">, "className" | "style"> & {
  variant?: "primary" | "secondary";
  fullWidth?: boolean;
  icon?: Icon;
  /** Renders this element instead of a button, for example a router link. It receives our props, classes and ref. */
  render?: ReactElement;
};

export function Button({ variant = "primary", fullWidth = false, icon: Icon, children, render, ...props }: ButtonProps) {
  return useRender({
    render: render ?? <BaseButton />,
    props: mergeProps<"button">(
      {
        className: button({ variant, fullWidth }),
        children: (
          <>
            {Icon && <Icon aria-hidden />}
            {children}
          </>
        ),
      },
      props,
    ),
  });
}

import { Button as BaseButton } from "@base-ui/react/button";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ComponentProps, ReactElement } from "react";

/** The pill look shared by Button and IconButton, with a press that shrinks it slightly. */
export const pressableClasses =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap motion-safe:transition motion-safe:duration-press motion-safe:ease-press motion-safe:not-data-disabled:active:scale-97 data-disabled:bg-subtle data-disabled:text-muted";

const button = cva(pressableClasses, {
  variants: {
    variant: {
      primary: "bg-primary text-on-primary",
      secondary: "border border-line bg-paper text-ink shadow-card",
      // White on a cobalt brand panel, in either theme.
      inverse: "bg-white text-black",
    },
    size: { md: "min-h-11 px-5.5 py-2 text-body", sm: "min-h-9.5 px-4 text-caption" },
    // A ring and a cobalt glow for the one call to action on a page.
    glow: {
      true: "shadow-glow ring-2 ring-primary ring-offset-2 ring-offset-canvas shadow-primary/55 hover:shadow-primary/70",
    },
    fullWidth: { true: "w-full" },
  },
});

export type ButtonProps = Omit<ComponentProps<"button">, "className" | "style"> & {
  variant?: "primary" | "secondary" | "inverse";
  size?: "md" | "sm";
  glow?: boolean;
  fullWidth?: boolean;
  icon?: Icon;
  /**
   * Renders this element instead of a button, for example a router link. It receives our props, classes and ref.
   * Button-only behaviour (`disabled`, `type`) doesn't apply to it.
   */
  render?: ReactElement;
};

export function Button({ variant = "primary", size = "md", glow = false, fullWidth = false, icon: Icon, children, render, ...props }: ButtonProps) {
  return useRender({
    render: render ?? <BaseButton />,
    props: mergeProps<"button">(
      {
        className: button({ variant, size, glow, fullWidth }),
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

import { Button as BaseButton } from "@base-ui/react/button";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ComponentProps, ReactElement } from "react";

export const pressableClasses =
  "inline-flex items-center justify-center gap-2 rounded-full cursor-pointer font-medium data-disabled:cursor-not-allowed motion-safe:transition motion-safe:duration-press motion-safe:ease-press motion-safe:not-data-disabled:active:scale-97 data-disabled:bg-subtle data-disabled:text-muted";

const button = cva(`${pressableClasses} min-w-0 max-w-full`, {
  variants: {
    variant: {
      primary: "bg-primary text-on-primary not-data-disabled:hover:bg-primary/90",
      secondary: "border border-line bg-subtle text-ink not-data-disabled:hover:bg-line",
      danger:
        "border border-incorrect/30 bg-incorrect-tint text-incorrect not-data-disabled:hover:bg-incorrect/25 data-disabled:bg-incorrect-tint! data-disabled:text-incorrect! data-disabled:opacity-60",
      inverse: "bg-white text-black",
    },
    size: { md: "min-h-11 px-5.5 py-2 text-caption", sm: "min-h-11 px-4 text-caption" },
    glow: {
      true: "shadow-glow ring-2 ring-primary ring-offset-2 ring-offset-canvas shadow-primary/55 hover:shadow-primary/70",
    },
    fullWidth: { true: "w-full" },
  },
});

// Raised buttons stand on a solid lip and press down into it, like the Roadmap's. A Lesson's Back / Next use them.
const raisedButton = cva(
  "inline-flex min-h-13 min-w-0 max-w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 px-5 text-caption font-bold tracking-wider uppercase shadow-coin data-disabled:cursor-not-allowed data-disabled:border-path-locked data-disabled:bg-subtle data-disabled:text-muted data-disabled:[--coin-edge:var(--color-path-locked)] motion-safe:transition motion-safe:duration-press motion-safe:ease-press not-data-disabled:active:translate-y-1.5 not-data-disabled:active:shadow-coin-pressed",
  {
    variants: {
      variant: {
        primary:
          "border-brand bg-brand-mid bg-linear-to-b from-bevel-hi to-transparent to-60% text-on-brand [--coin-edge:var(--color-brand)] not-data-disabled:hover:brightness-110",
        secondary:
          "border-path-locked bg-paper text-ink [--coin-edge:var(--color-path-locked)] not-data-disabled:hover:bg-subtle",
      },
      fullWidth: { true: "w-full" },
    },
  },
);

export type ButtonProps = Omit<ComponentProps<"button">, "className" | "style"> & {
  variant?: "primary" | "secondary" | "danger" | "inverse";
  size?: "md" | "sm";
  glow?: boolean;
  fullWidth?: boolean;
  /** The raised, game-like look (primary or secondary only). */
  raised?: boolean;
  icon?: Icon;
  render?: ReactElement;
};

export function Button({
  variant = "primary",
  size = "md",
  glow = false,
  fullWidth = false,
  raised = false,
  icon: Icon,
  children,
  render,
  ...props
}: ButtonProps) {
  return useRender({
    render: render ?? <BaseButton />,
    props: mergeProps<"button">(
      {
        className: raised
          ? raisedButton({ variant: variant === "secondary" ? "secondary" : "primary", fullWidth })
          : button({ variant, size, glow, fullWidth }),
        children: (
          <>
            {Icon && <Icon aria-hidden className="shrink-0" />}
            <span className="min-w-0 text-center whitespace-normal">{children}</span>
          </>
        ),
      },
      props,
    ),
  });
}

import { cva } from "class-variance-authority";
import type { ReactNode } from "react";

export const textSizeClasses = {
  label: "text-label uppercase app:normal-case",
  caption: "text-caption",
  body: "text-body",
  title: "text-title",
  heading: "text-heading",
  page: "text-page",
  hero: "text-hero",
};

export type TextSize = keyof typeof textSizeClasses;

const text = cva("", {
  variants: {
    size: textSizeClasses,
    tone: { ink: "text-ink", muted: "text-muted" },
    tabular: { true: "tabular-nums" },
  },
});

export type TextProps = {
  size?: TextSize;
  tone?: "ink" | "muted";
  as?: "p" | "span" | "div";
  tabular?: boolean;
  children?: ReactNode;
};

export function Text({ size = "body", tone = "ink", as: As = "p", tabular, children }: TextProps) {
  return <As className={text({ size, tone, tabular })}>{children}</As>;
}

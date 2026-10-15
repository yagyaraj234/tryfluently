import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { textSize, type TextSize } from "./Text.tsx";

const heading = cva("text-balance text-ink", { variants: { size: textSize } });

const defaultSize = { 1: "page", 2: "heading", 3: "title" } as const;

export type HeadingProps = {
  level: 1 | 2 | 3;
  size?: TextSize;
  children?: ReactNode;
};

export function Heading({ level, size = defaultSize[level], children }: HeadingProps) {
  const H = `h${level}` as const;
  return <H className={heading({ size })}>{children}</H>;
}

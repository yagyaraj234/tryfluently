import { cva } from "class-variance-authority";
import type { ReactNode } from "react";

const container = cva("mx-auto w-full", {
  variants: {
    width: { content: "max-w-content", prose: "max-w-prose", page: "max-w-page" },
  },
});

export type ContainerProps = {
  width?: "content" | "prose" | "page";
  children?: ReactNode;
};

export function Container({ width = "content", children }: ContainerProps) {
  return <div className={container({ width })}>{children}</div>;
}

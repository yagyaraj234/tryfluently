import { cva } from "class-variance-authority";
import type { ReactNode } from "react";

const container = cva("mx-auto w-full", {
  variants: {
    width: { content: "max-w-content", prose: "max-w-prose" },
  },
});

export type ContainerProps = {
  width?: "content" | "prose";
  children?: ReactNode;
};

export function Container({ width = "content", children }: ContainerProps) {
  return <div className={container({ width })}>{children}</div>;
}

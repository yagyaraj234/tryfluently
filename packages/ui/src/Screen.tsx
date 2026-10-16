import { cva } from "class-variance-authority";
import type { ReactNode } from "react";

const screen = cva("min-h-dvh bg-surface px-4 py-10 text-ink", {
  variants: {
    surface: { loud: "surface-loud", quiet: "surface-quiet" },
  },
});

export type ScreenProps = {
  surface: "loud" | "quiet";
  children?: ReactNode;
};

export function Screen({ surface, children }: ScreenProps) {
  return <main className={screen({ surface })}>{children}</main>;
}

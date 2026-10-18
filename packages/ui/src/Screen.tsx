import type { ReactNode } from "react";

export type ScreenProps = {
  children?: ReactNode;
};

export function Screen({ children }: ScreenProps) {
  return <main className="min-h-dvh bg-canvas px-4 py-10 text-ink">{children}</main>;
}

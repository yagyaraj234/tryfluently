import type { Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactNode } from "react";

const chip = cva("inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-caption font-bold text-ink", {
  variants: {
    tone: { paper: "bg-paper", soft: "bg-primary-soft" },
  },
});

export type ChipProps = {
  tone?: "paper" | "soft";
  icon?: Icon;
  /** Required: the icon is decorative, so the text is all a screen reader gets. */
  children: ReactNode;
};

/** A small outlined pill, for labels like a Streak count or a CEFR Level. */
export function Chip({ tone = "paper", icon: Icon, children }: ChipProps) {
  return (
    <span className={chip({ tone })}>
      {Icon && <Icon aria-hidden />}
      {children}
    </span>
  );
}

import { cva } from "class-variance-authority";
import type { ReactNode } from "react";

const notice = cva("rounded-xl border border-line px-4 py-3 text-body text-ink", {
  variants: {
    tone: { error: "bg-incorrect-tint", info: "bg-primary-soft" },
  },
});

export type NoticeProps = {
  tone: "error" | "info";
  children: ReactNode;
};

export function Notice({ tone, children }: NoticeProps) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={notice({ tone })}>
      {children}
    </div>
  );
}

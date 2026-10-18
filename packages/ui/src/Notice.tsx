import { cva } from "class-variance-authority";
import type { ReactNode } from "react";

const notice = cva("rounded-xl border border-line px-4 py-3 text-body text-ink", {
  variants: {
    tone: { error: "bg-incorrect-tint", info: "bg-primary-soft" },
  },
});

export type NoticeProps = {
  /** `error` interrupts as an alert (a failed sign-in); `info` is a polite status (when a retake opens). */
  tone: "error" | "info";
  children: ReactNode;
};

/** A message in the flow of a form or screen, for errors that don't belong to one field. */
export function Notice({ tone, children }: NoticeProps) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={notice({ tone })}>
      {children}
    </div>
  );
}

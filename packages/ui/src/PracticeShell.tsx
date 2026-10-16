import { X } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { IconButton } from "./IconButton";

// Quiet, with no navigation, so the Learner can concentrate. One column at any width.
const shell = cva("surface-quiet flex min-h-dvh flex-col bg-surface px-4 text-ink");
const header = cva("mx-auto flex w-full max-w-content items-center py-3");
const main = cva("mx-auto w-full max-w-content flex-1 pb-10");

export type PracticeShellProps = {
  /** Called when the Learner closes the screen; call `preventDefault()` to stop a `closeRender` link navigating. */
  onClose?: (event: MouseEvent) => void;
  /** Renders the close action as this element, for example a router link back to Home. */
  closeRender?: ReactElement;
  children?: ReactNode;
};

/** The chrome for practice screens (Lesson player, Roleplay, live Assessment): only a close action. */
export function PracticeShell({ onClose, closeRender, children }: PracticeShellProps) {
  return (
    <div className={shell()}>
      <header className={header()}>
        <IconButton icon={X} label="Close" onClick={onClose} render={closeRender} />
      </header>
      <main className={main()}>{children}</main>
    </div>
  );
}

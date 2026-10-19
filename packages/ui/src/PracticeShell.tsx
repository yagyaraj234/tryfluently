import { X } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { IconButton } from "./IconButton";

// No navigation, so the Learner can concentrate. One column at any width.
const shell = cva("flex min-h-dvh flex-col bg-canvas px-4 text-ink");
const header = cva("sticky top-0 z-sticky mx-auto flex w-full max-w-3xl items-center gap-3 bg-canvas py-3");
const title = cva("min-w-0 truncate text-caption font-semibold text-muted");
const main = cva("mx-auto w-full max-w-3xl flex-1 pb-10 pt-4");

export type PracticeShellProps = {
  /** Called when the Learner closes the screen; call `preventDefault()` to stop a `closeRender` link navigating. */
  onClose?: (event: MouseEvent) => void;
  /** Renders the close action as this element, for example a router link back to Home. */
  closeRender?: ReactElement;
  /** What's being practised, for example the Lesson's Unit, shown next to the close action. */
  title?: string;
  children?: ReactNode;
};

/** The chrome for practice screens (Lesson player, Roleplay, live Assessment): only a close action. */
export function PracticeShell({ onClose, closeRender, title: name, children }: PracticeShellProps) {
  return (
    <div className={shell()}>
      <header className={header()}>
        <IconButton icon={X} label="Close" onClick={onClose} render={closeRender} />
        {name && <p className={title()}>{name}</p>}
      </header>
      <main className={main()}>{children}</main>
    </div>
  );
}

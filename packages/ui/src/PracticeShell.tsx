import { X } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { IconButton } from "./IconButton";

const shell = cva("flex type-app min-h-dvh flex-col bg-canvas px-4 text-ink");
const header = cva("sticky top-0 z-sticky mx-auto flex w-full max-w-3xl items-center gap-3 bg-canvas py-3");
const title = cva("min-w-0 truncate text-caption font-semibold text-muted");
const main = cva("mx-auto w-full max-w-3xl flex-1 pb-10 pt-4");

export type PracticeShellProps = {
  onClose?: (event: MouseEvent) => void;
  closeRender?: ReactElement;
  title?: string;
  children?: ReactNode;
};

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

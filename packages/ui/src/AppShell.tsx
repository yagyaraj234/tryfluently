import { useRender } from "@base-ui/react/use-render";
import type { Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactElement, ReactNode } from "react";

// Phone: header on top, a tab bar stuck to the bottom. Desktop: the tab bar becomes a sidebar on the left.
const shell = cva("flex min-h-dvh flex-col bg-canvas text-ink lg:flex-row");
const body = cva("flex min-w-0 flex-1 flex-col");
const header = cva("flex items-center justify-between gap-4 px-4 py-3 lg:justify-end lg:px-8 lg:py-5");
const wordmark = cva("text-title", { variants: { at: { header: "lg:hidden", nav: "hidden px-4 pt-6 pb-2 lg:block" } } });
const status = cva("flex items-center gap-2");
const main = cva("flex-1 px-4 pb-10 lg:px-8");
const nav = cva(
  "sticky bottom-0 z-sticky order-last border-line max-lg:border-t bg-paper lg:top-0 lg:order-first lg:h-dvh lg:w-sidebar lg:shrink-0 lg:border-r",
);
const list = cva("flex lg:flex-col lg:gap-1 lg:p-4");
const destination = cva(
  "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-label text-ink current:bg-primary-soft current:text-primary lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-4 lg:py-3 lg:text-body lg:font-semibold lg:tracking-normal",
);
const item = cva("flex flex-1 lg:flex-none");
const icon = cva("text-title");

export type AppShellDestination = {
  label: string;
  icon: Icon;
  /**
   * The link to render, for example a router link. Mark the current destination with `aria-current="page"`
   * (TanStack Router's Link does this itself).
   */
  render: ReactElement;
};

export type AppShellProps = {
  destinations: AppShellDestination[];
  /** Shown next to the wordmark, for example the Streak and XP chips. */
  status?: ReactNode;
  children?: ReactNode;
};

/** The signed-in chrome: a bottom tab bar on phones, a sidebar at desktop, and the wordmark with the status. */
export function AppShell({ destinations, status: statusSlot, children }: AppShellProps) {
  return (
    <div className={shell()}>
      <nav className={nav()}>
        <span className={wordmark({ at: "nav" })}>Impromptu</span>
        <ul className={list()}>
          {destinations.map((d) => (
            <Destination key={d.label} {...d} />
          ))}
        </ul>
      </nav>
      <div className={body()}>
        <header className={header()}>
          <span className={wordmark({ at: "header" })}>Impromptu</span>
          <div className={status()}>{statusSlot}</div>
        </header>
        <main className={main()}>{children}</main>
      </div>
    </div>
  );
}

function Destination({ label, icon: Icon, render }: AppShellDestination) {
  const link = useRender({
    render,
    props: {
      className: destination(),
      children: (
        <>
          <span className={icon()}>
            <Icon aria-hidden />
          </span>
          {label}
        </>
      ),
    },
  });
  return <li className={item()}>{link}</li>;
}

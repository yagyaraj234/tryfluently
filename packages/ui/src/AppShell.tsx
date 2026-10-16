import { useRender } from "@base-ui/react/use-render";
import type { Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactElement, ReactNode } from "react";

// Phone: header on top, a tab bar stuck to the bottom. Desktop: the tab bar becomes a sidebar on the left.
const shell = cva("surface-loud flex min-h-dvh flex-col bg-surface text-ink desktop:flex-row");
const body = cva("flex flex-1 flex-col");
const header = cva("flex items-center justify-between gap-4 px-4 py-3");
const wordmark = cva("text-title");
const status = cva("flex items-center gap-2");
const main = cva("flex-1 px-4 pb-10");
const nav = cva(
  "sticky bottom-0 z-sticky order-last border-line max-desktop:border-t-2 bg-paper desktop:top-0 desktop:order-first desktop:h-dvh desktop:w-sidebar desktop:shrink-0 desktop:border-r-2",
);
const list = cva("flex desktop:flex-col desktop:gap-2 desktop:p-4");
const destination = cva(
  "flex min-h-target flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-label text-ink focus-visible:focus-ring current:bg-primary-soft current:text-primary desktop:flex-row desktop:justify-start desktop:gap-3 desktop:rounded-md desktop:px-4 desktop:text-body desktop:font-bold",
);
const item = cva("flex flex-1 desktop:flex-none");
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
        <ul className={list()}>
          {destinations.map((d) => (
            <Destination key={d.label} {...d} />
          ))}
        </ul>
      </nav>
      <div className={body()}>
        <header className={header()}>
          <span className={wordmark()}>Impromptu</span>
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

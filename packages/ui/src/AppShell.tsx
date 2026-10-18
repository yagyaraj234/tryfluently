import { useRender } from "@base-ui/react/use-render";
import type { Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactElement, ReactNode } from "react";
import { LogoMark } from "./Logo";

// Phone: the top bar, then a tab bar stuck to the bottom. Desktop: the tab bar becomes a sidebar on the left.
const shell = cva("flex min-h-dvh flex-col bg-canvas text-ink lg:flex-row");
const body = cva("flex min-w-0 flex-1 flex-col");
const header = cva(
  "sticky top-0 z-sticky flex min-h-16 items-center justify-between gap-4 border-b border-line bg-paper/90 px-4 backdrop-blur-md reduce-transparency:bg-paper lg:px-8",
);
const heading = cva("text-title");
// The landing page's logo, so the app and the site read as one product.
const logo = cva("hidden items-center gap-2 px-3 pt-6 pb-8 text-xl font-bold tracking-tighter text-primary lg:flex");
const menu = cva("hidden px-3 pb-2 text-label text-muted uppercase lg:block");
const status = cva("flex items-center gap-2");
const main = cva("flex-1 px-4 pt-6 pb-10 lg:px-8");
const nav = cva(
  "sticky bottom-0 z-sticky order-last border-line max-lg:border-t bg-paper lg:top-0 lg:order-first lg:h-dvh lg:w-sidebar lg:shrink-0 lg:border-r lg:px-4",
);
const list = cva("flex lg:flex-col lg:gap-1");
const destination = cva(
  "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-label text-muted current:text-primary lg:min-h-10 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-3 lg:text-caption lg:font-medium lg:tracking-normal lg:text-ink lg:hover:bg-subtle lg:current:bg-primary-soft lg:current:font-semibold lg:current:text-primary",
);
const item = cva("flex flex-1 lg:flex-none");
const icon = cva("text-title lg:text-body");

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
  /** The page's one heading, in the top bar. */
  title?: string;
  /** Shown at the right of the top bar, for example the Streak and XP chips. */
  status?: ReactNode;
  children?: ReactNode;
};

/** The signed-in chrome: a top bar with the page title and status, and a bottom tab bar on phones or a sidebar at desktop. */
export function AppShell({ destinations, title, status: statusSlot, children }: AppShellProps) {
  return (
    <div className={shell()}>
      <nav className={nav()}>
        <span className={logo()}>
          <LogoMark className="size-7 text-ink" />
          get fluency
        </span>
        <span className={menu()}>Menu</span>
        <ul className={list()}>
          {destinations.map((d) => (
            <Destination key={d.label} {...d} />
          ))}
        </ul>
      </nav>
      <div className={body()}>
        <header className={header()}>
          {title ? <h1 className={heading()}>{title}</h1> : <span />}
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

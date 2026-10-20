import { useRender } from "@base-ui/react/use-render";
import type { Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactElement, ReactNode } from "react";
import { LogoMark } from "./Logo";

const shell = cva("type-app flex min-h-dvh flex-col bg-canvas text-ink lg:flex-row");
const body = cva("flex min-w-0 flex-1 flex-col");
const header = cva(
  "sticky top-0 z-sticky flex min-h-20 flex-wrap items-center justify-between gap-3 bg-canvas px-4 py-4 lg:min-h-20 lg:px-8",
);
const headerContent = cva("flex w-full flex-wrap items-center justify-between gap-3");
const heading = cva("min-w-0 text-heading");
const logo = cva("hidden items-center gap-2 px-3 pt-8 pb-10 text-xl font-bold tracking-tighter text-primary lg:flex");
const menu = cva("hidden px-3 pb-2 text-label text-muted lg:block");
const status = cva("flex items-center gap-2");
const main = cva("w-full flex-1 px-4 pt-2 pb-10 lg:px-8");
const nav = cva(
  "sticky bottom-0 z-sticky order-last border-line bg-paper pb-[env(safe-area-inset-bottom)] max-lg:border-t lg:top-0 lg:order-first lg:h-dvh lg:w-sidebar lg:shrink-0 lg:border-r lg:bg-canvas lg:px-4",
);
const list = cva("flex lg:flex-col lg:gap-1");
const destination = cva(
  "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-label text-muted current:text-primary lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-3 lg:text-caption lg:font-medium lg:tracking-normal lg:text-ink lg:hover:bg-line lg:current:bg-line lg:current:font-semibold lg:current:text-ink",
);
const item = cva("flex flex-1 lg:flex-none");
const icon = cva("text-title");

export type AppShellDestination = {
  label: string;
  icon: Icon;
  render: ReactElement;
};

export type AppShellProps = {
  destinations: AppShellDestination[];
  title?: string;
  status?: ReactNode;
  children?: ReactNode;
};

export function AppShell({ destinations, title, status: statusSlot, children }: AppShellProps) {
  return (
    <div className={shell()}>
      <Sidebar destinations={destinations} />
      <div className={body()}>
        <TopBar title={title}>{statusSlot}</TopBar>
        <main className={main()}>{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ destinations }: { destinations: AppShellDestination[] }) {
  return (
    <nav aria-label="Main navigation" className={nav()}>
      <span className={logo()}>
        <LogoMark className="size-7 text-ink" />
        <span className="text-ink"> fluently</span>
      </span>
      <span className={menu()}>Menu</span>
      <ul className={list()}>
        {destinations.map((d) => (
          <Destination key={d.label} {...d} />
        ))}
      </ul>
    </nav>
  );
}

function TopBar({ title, children }: { title?: string; children?: ReactNode }) {
  const titleNode = title ? <h1 className={heading()}>{title}</h1> : <span />;
  return (
    <header className={header()}>
      <div className={headerContent()}>
        {titleNode}
        <div className={status()}>{children}</div>
      </div>
    </header>
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
          <span className="whitespace-nowrap max-lg:text-xs max-lg:tracking-normal">{label}</span>
        </>
      ),
    },
  });
  return <li className={item()}>{link}</li>;
}

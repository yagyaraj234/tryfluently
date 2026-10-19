import { Menu as BaseMenu } from "@base-ui/react/menu";
import { cva } from "class-variance-authority";
import type { ReactElement } from "react";

const popup = cva(
  "flex min-w-(--anchor-width) max-h-(--available-height) origin-(--transform-origin) flex-col overflow-y-auto rounded-xl border border-line bg-paper p-1 text-ink shadow-card motion-safe:transition motion-safe:duration-ui motion-safe:ease-ui data-starting-style:opacity-0 data-ending-style:opacity-0",
);

const item = cva(
  "flex min-h-11 cursor-default items-center rounded-lg px-3 text-body data-highlighted:bg-primary-soft",
);

/** Either an action (`onSelect`) or a link (`render`, for example a router link), never both. */
export type MenuItem = { label: string } & (
  { onSelect: () => void; render?: never } | { render: ReactElement; onSelect?: never }
);

export type MenuProps = {
  /** The element that opens the menu, for example `<IconButton icon={DotsThree} label="More" />`. */
  trigger: ReactElement;
  items: MenuItem[];
};

export function Menu({ trigger, items }: MenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner className="z-overlay" align="start" sideOffset={8}>
          <BaseMenu.Popup className={popup()}>
            {items.map(({ label, onSelect, render }) => (
              <BaseMenu.Item key={label} className={item()} onClick={onSelect} render={render}>
                {label}
              </BaseMenu.Item>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

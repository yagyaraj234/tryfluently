import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";

const fade =
  "motion-safe:transition motion-safe:duration-ui motion-safe:ease-ui data-starting-style:opacity-0 data-ending-style:opacity-0";

const backdrop = cva(`fixed inset-0 z-overlay min-h-dvh bg-scrim ${fade}`);

const viewport = cva("fixed inset-0 z-overlay flex justify-center", {
  variants: {
    kind: { dialog: "items-center p-4", sheet: "items-end lg:items-center lg:p-4" },
  },
});

const popup = cva(
  `type-app flex max-h-full w-full max-w-content flex-col gap-4 overflow-y-auto border border-line bg-paper p-6 text-ink shadow-card ${fade}`,
  {
    variants: {
      kind: {
        dialog: "rounded-xl",
        sheet:
          "rounded-t-xl lg:rounded-xl max-lg:data-starting-style:translate-y-full max-lg:data-ending-style:translate-y-full",
      },
    },
  },
);

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
};

export function Overlay({
  kind,
  open,
  onOpenChange,
  title,
  description,
  children,
}: DialogProps & { kind: "dialog" | "sheet" }) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={backdrop()} />
        <BaseDialog.Viewport className={viewport({ kind })}>
          <BaseDialog.Popup className={popup({ kind })}>
            <div className="flex items-start justify-between gap-4">
              <BaseDialog.Title className="text-title text-balance">{title}</BaseDialog.Title>
              <BaseDialog.Close render={<IconButton icon={X} label="Close" />} />
            </div>
            {description && (
              <BaseDialog.Description className="text-body text-muted">{description}</BaseDialog.Description>
            )}
            {children}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export function Dialog(props: DialogProps) {
  return <Overlay kind="dialog" {...props} />;
}

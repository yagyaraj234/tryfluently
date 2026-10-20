import { Toast } from "@base-ui/react/toast";
import { X } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

export const toastManager = Toast.createToastManager();

const viewport = cva("fixed inset-x-4 bottom-4 z-toast mx-auto flex max-w-content flex-col gap-2");
const root = cva(
  "type-app flex items-start gap-3 rounded-xl border border-line bg-paper p-4 text-ink shadow-card data-limited:hidden data-starting-style:opacity-0 data-ending-style:opacity-0 motion-safe:transition motion-safe:duration-ui motion-safe:ease-ui motion-safe:data-starting-style:translate-y-4",
);
const text = cva("flex flex-1 flex-col gap-1");
const title = cva("text-body font-semibold");
const description = cva("text-caption text-muted");

export function Toasts() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport className={viewport()}>
        {toasts.map((toast) => (
          <Toast.Root key={toast.id} toast={toast} className={root()}>
            <div className={text()}>
              <Toast.Title className={title()} />
              <Toast.Description className={description()} />
            </div>
            <Toast.Action render={<Button variant="secondary" />} />
            <Toast.Close render={<IconButton icon={X} label="Dismiss" />} />
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

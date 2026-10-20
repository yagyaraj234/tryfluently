import { Toast } from "@base-ui/react/toast";
import { IconContext } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Toasts, toastManager } from "./Toast";

const iconDefaults = { weight: "regular", size: 20 } as const;

export function UIProvider({ children }: { children?: ReactNode }) {
  return (
    <IconContext.Provider value={iconDefaults}>
      <Toast.Provider toastManager={toastManager}>
        <div className="isolate">{children}</div>
        <Toasts />
      </Toast.Provider>
    </IconContext.Provider>
  );
}

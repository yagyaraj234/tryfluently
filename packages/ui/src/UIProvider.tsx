import { Toast } from "@base-ui/react/toast";
import { IconContext } from "@phosphor-icons/react";
import type { ReactNode } from "react";

const iconDefaults = { weight: "bold", size: "1em" } as const;

/** Wrap the app once. Theme is the app's job: it renders `data-theme` on `<html>`. */
export function UIProvider({ children }: { children?: ReactNode }) {
  return (
    <IconContext.Provider value={iconDefaults}>
      <Toast.Provider>
        <div className="isolate">{children}</div>
      </Toast.Provider>
    </IconContext.Provider>
  );
}

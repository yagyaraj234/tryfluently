import { Button, Cluster, Dialog, IconButton, Menu, Sheet, toastManager } from "@impromptu/ui";
import { DotsThree } from "@phosphor-icons/react";
import { useState } from "react";
import { Example, sample } from "./shared";

const showToast = () =>
  toastManager.add({
    title: "Saved",
    description: "Your preference was saved.",
    actionProps: { children: "Undo", onClick: sample },
  });

export function OverlaysSection() {
  const [open, setOpen] = useState<"dialog" | "sheet">();
  const close = () => setOpen(undefined);
  const onOpenChange = (v: boolean) => !v && close();
  return (
    <Example title="Overlays and toasts">
      <Cluster>
        <Button onClick={() => setOpen("dialog")}>Open Dialog</Button>
        <Button variant="secondary" onClick={() => setOpen("sheet")}>
          Open Sheet
        </Button>
        <Menu
          trigger={<IconButton icon={DotsThree} label="Open Menu" />}
          items={[{ label: "Example action", onSelect: sample }]}
        />
        <Button variant="secondary" onClick={showToast}>
          Show Toast
        </Button>
      </Cluster>
      <Dialog
        open={open === "dialog"}
        onOpenChange={onOpenChange}
        title="Dialog preview"
        description="Tab stays inside. Escape closes and returns focus to the trigger."
      >
        <Button onClick={close}>Close Dialog</Button>
      </Dialog>
      <Sheet
        open={open === "sheet"}
        onOpenChange={onOpenChange}
        title="Sheet preview"
        description="Bottom sheet on phone, centred dialog on desktop."
      >
        <Button onClick={close}>Close Sheet</Button>
      </Sheet>
    </Example>
  );
}

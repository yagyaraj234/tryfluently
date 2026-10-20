import { Button, Cluster, Dialog, IconButton } from "@impromptu/ui";
import { SignOut } from "@phosphor-icons/react";
import { useState } from "react";

type Props = { pending: boolean; onConfirm: () => Promise<void> };

export function SignOutControl({ pending, onConfirm }: Props) {
  const [open, setOpen] = useState(false);

  async function confirm() {
    await onConfirm();
    setOpen(false);
  }

  return (
    <>
      <IconButton icon={SignOut} label="Sign out" title="Sign out" disabled={pending} onClick={() => setOpen(true)} />
      <Dialog
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title="Sign out?"
        description="Are you sure you want to sign out? Your answers on this screen won't be saved."
      >
        <Cluster gap={3}>
          <Button disabled={pending} onClick={() => void confirm()}>
            {pending ? "Signing out…" : "Sign out"}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
            Stay
          </Button>
        </Cluster>
      </Dialog>
    </>
  );
}

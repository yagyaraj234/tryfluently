import { Button, Dialog, Notice } from "@impromptu/ui";

export type Selected = { title: string; objective: string };

type Props = {
  selected: Selected | undefined;
  pending: boolean;
  success: boolean;
  failed: boolean;
  onStart: () => void;
  onClose: () => void;
};

export function StartLessonDialog({ selected, pending, success, failed, onStart, onClose }: Props) {
  const preparing = pending || success;
  return (
    <Dialog
      open={Boolean(selected)}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title={`Start ${selected?.title ?? "your Lesson"}?`}
      description={selected?.objective}
    >
      {failed && <Notice tone="error">Your Lesson couldn’t be started. Try again.</Notice>}
      <Button fullWidth disabled={preparing} onClick={onStart}>
        {preparing ? "Preparing your Lesson…" : "Start Lesson"}
      </Button>
    </Dialog>
  );
}

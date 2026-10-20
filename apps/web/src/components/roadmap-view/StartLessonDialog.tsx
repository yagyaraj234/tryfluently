import { Button, Chip, Cluster, Dialog, Notice } from "@fluently/ui";

// estimatedMinutes and pageCount come from the stored outline. Outlines saved before paged Lessons have neither.
export type Selected = {
  title: string;
  objective: string;
  position: number;
  kind: "practice" | "roleplay";
  skill: string;
  estimatedMinutes?: number;
  pageCount?: number;
};

type Props = {
  selected: Selected | undefined;
  pending: boolean;
  success: boolean;
  failed: boolean;
  onStart: () => void;
  onClose: () => void;
};

// Fallback for old outlines with no pageCount; matches the 5 Pages the API writes when none is given.
const DEFAULT_PAGES = 5;

export function StartLessonDialog({ selected, pending, success, failed, onStart, onClose }: Props) {
  const preparing = pending || success;
  const practice = selected?.kind === "practice";
  return (
    <Dialog
      open={Boolean(selected)}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title={`Start ${selected?.title ?? "your Lesson"}?`}
      description={selected?.objective}
    >
      {practice && (
        <Cluster>
          <Chip>{selected.skill}</Chip>
          {selected.estimatedMinutes && <Chip>About {selected.estimatedMinutes} min</Chip>}
          <Chip>{selected.pageCount ?? DEFAULT_PAGES} pages</Chip>
        </Cluster>
      )}
      {failed && <Notice tone="error">Your Lesson couldn’t be started. Try again.</Notice>}
      <Button fullWidth disabled={preparing} onClick={onStart}>
        {preparing ? "Preparing your Lesson…" : practice ? "Start learning" : "Start Lesson"}
      </Button>
    </Dialog>
  );
}

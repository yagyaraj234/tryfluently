import { Button, LoadingState, Notice } from "@impromptu/ui";

export function PlanningNotice({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  if (!failed)
    return <LoadingState title="Planning your Lessons" description="Choosing different practice for each Unit." />;
  return (
    <Notice tone="error">
      Your existing Lessons are safe. We couldn’t plan the remaining Lessons.{" "}
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </Notice>
  );
}

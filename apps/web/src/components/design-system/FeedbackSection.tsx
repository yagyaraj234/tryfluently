import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Meter,
  Notice,
  OfflineBanner,
  PollyWalking,
  ProgressBar,
  Skeleton,
  Spinner,
} from "@fluently/ui";
import { Example, sample } from "./shared";

export function FeedbackSection() {
  return (
    <Example title="Feedback and system states">
      <ProgressBar label="Lesson progress" value={3} max={7} />
      <Meter label="Unit objective" value={65} max={100} />
      <PollyWalking label="Polly walking" />
      <Spinner label="Loading preview" />
      <Skeleton shape="text" />
      <Skeleton shape="block" size={14} />
      <Skeleton shape="circle" size={10} />
      <Notice tone="info">Your answers are saved.</Notice>
      <Notice tone="error">We couldn't save that. Try again.</Notice>
      <OfflineBanner />
      <LoadingState title="Preparing your next Step" description="Each Step builds on how you did on the last one." />
      <EmptyState title="No Focus Items yet" description="They appear after an Assessment or Lesson." />
      <ErrorState title="Your Step couldn't be loaded" description="Your answers so far are saved." onRetry={sample} />
      <EmptyState
        title="You've used this month's voice minutes"
        description="Your free voice minutes renew on the first of each month at 00:00 UTC. Add a minute pack from Profile, subscribe to Pro, or type instead."
        action={<Button onClick={sample}>Type instead</Button>}
      />
      <Notice tone="info">Your next Assessment opens in 7 days. Keep practising with Lessons.</Notice>
    </Example>
  );
}

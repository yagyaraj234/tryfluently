import { Button } from "./Button";
import { Card } from "./Card";
import { Notice } from "./Notice";
import { Stack } from "./Stack";
import { Text } from "./Text";
import { VerdictTag } from "./VerdictTag";

/** What the player knows about the browser's speech recognition for one Page. */
export type SpeechControl = {
  status: "idle" | "listening" | "unsupported" | "denied" | "failed";
  /** Live words so far, shown as captions. */
  interim: string;
  /** A replay of the Learner's own voice, held only in this browser's memory. */
  audioUrl?: string;
  start: () => void;
  stop: () => void;
  onRetry: () => void;
};

/** Spoken-answer result: the transcript is saved straight away, the written feedback arrives a moment later. */
export type SpeakResult = {
  answer: unknown;
  verdict: "correct" | "incorrect" | null;
  explanation: string | null;
  analysis?: "analysing" | "done" | "failed";
};

/** A short note for why the Learner is typing instead of speaking. Undefined while speaking can work. */
export const speechNote = (status: SpeechControl["status"]) =>
  status === "unsupported"
    ? "Speaking isn't available in this browser, so type your answer instead."
    : status === "denied"
      ? "We can't use your microphone, so type your answer instead."
      : status === "failed"
        ? "Speech recognition isn't working right now, so type your answer instead."
        : undefined;

/** Three dots that pulse while the speech is checked. Still when the Learner prefers reduced motion. */
function Analysing() {
  return (
    <div role="status" className="flex items-center gap-3">
      <span aria-hidden className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{ animationDelay: `${i * 150}ms` }}
            className="size-2 rounded-full bg-primary motion-safe:animate-pulse"
          />
        ))}
      </span>
      <Text tone="muted">Analysing your speech…</Text>
    </div>
  );
}

export function SpeakAnswer({
  prompt,
  speech,
  result,
  pending,
}: {
  prompt: string;
  speech: SpeechControl;
  result?: SpeakResult;
  pending: boolean;
}) {
  const listening = speech.status === "listening";
  return (
    <Stack gap={4}>
      <Text size="title">{prompt}</Text>
      {!result &&
        (pending ? (
          <Text tone="muted">Saving your answer…</Text>
        ) : (
          <Button variant={listening ? "secondary" : "primary"} onClick={listening ? speech.stop : speech.start}>
            {listening ? "Stop" : "Start speaking"}
          </Button>
        ))}
      {listening && (
        <div aria-live="polite" className="min-h-12 rounded-2xl border border-line bg-subtle p-4 text-body text-ink">
          {speech.interim || <span className="text-muted">Listening…</span>}
        </div>
      )}
      {result && (
        <Stack gap={3}>
          <blockquote className="rounded-2xl border border-line bg-subtle p-4 text-body text-ink">
            {String(result.answer)}
          </blockquote>
          {speech.audioUrl && (
            <audio controls src={speech.audioUrl} aria-label="Replay your recording" className="w-full" />
          )}
          {result.analysis === "analysing" && <Analysing />}
          {result.analysis === "failed" && (
            <Notice tone="error">
              <Stack gap={3}>
                <span>We couldn't check your speech. Your answer is saved.</span>
                <div>
                  <Button size="sm" onClick={speech.onRetry}>
                    Try again
                  </Button>
                </div>
              </Stack>
            </Notice>
          )}
          {result.analysis === "done" && result.verdict && (
            <div role="status">
              <Card size="sm">
                <Stack gap={2}>
                  <div>
                    <VerdictTag verdict={result.verdict} />
                  </div>
                  {result.explanation && <Text tone="muted">{result.explanation}</Text>}
                </Stack>
              </Card>
            </div>
          )}
        </Stack>
      )}
    </Stack>
  );
}

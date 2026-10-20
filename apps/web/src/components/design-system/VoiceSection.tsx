import {
  Cluster,
  LiveBar,
  Notice,
  RecordButton,
  Select,
  SpeakPromptStep,
  VoiceAnswer,
  VoiceOrb,
  type RecordingState,
} from "@impromptu/ui";
import { useState } from "react";
import { answered, Example, sample } from "./shared";

const states = [
  "idle",
  "recording",
  "processing",
  "done",
  "failed",
  "silent",
  "capped",
  "denied",
  "no-microphone",
  "unsupported",
];
const stateOptions = states.map((s) => ({ value: s, label: s }));
const buttonStates = ["idle", "recording", "processing"] as const;
const barStates = ["connecting", "live", "reconnecting"] as const;
const phases = ["connecting", "ready", "listening", "thinking", "speaking"] as const;

export function VoiceSection() {
  const [recording, setRecording] = useState<RecordingState>({ status: "idle" });
  const [muted, setMuted] = useState(false);
  const voice = {
    recording,
    onStart: () => setRecording({ status: "recording", seconds: 12, level: 0.6 }),
    onStop: () => setRecording({ status: "done", text: "I built a tool for my team." }),
    onRetry: () => setRecording({ status: "idle" }),
  };

  function pick(value: string) {
    if (value === "recording") return voice.onStart();
    if (value === "done") return voice.onStop();
    if (value === "failed" || value === "silent") return setRecording({ status: "failed", reason: value });
    if (value === "capped" || value === "denied" || value === "no-microphone" || value === "unsupported")
      return setRecording({ status: "unavailable", reason: value });
    setRecording({ status: value as "idle" | "processing" });
  }

  return (
    <Example title="Voice and recording">
      <Select label="Recording preview state" options={stateOptions} defaultValue="idle" onValueChange={pick} />
      <SpeakPromptStep key={recording.status} targetSeconds={60} {...voice} onAnswer={answered} />
      <VoiceAnswer label="Recorded vocabulary sentence" {...voice} prefer="text" onAnswer={answered} />
      <Cluster>
        {buttonStates.map((state) => (
          <RecordButton key={state} state={state} onStart={voice.onStart} onStop={voice.onStop} />
        ))}
      </Cluster>
      {barStates.map((state) => (
        <LiveBar
          key={state}
          state={state}
          title="Mock Interview · Standard"
          elapsed={120_000}
          left={60_000}
          muted={muted}
          onMutedChange={setMuted}
          onEnd={sample}
        />
      ))}
      <Cluster>
        {phases.map((phase) => (
          <VoiceOrb key={phase} phase={phase} label={phase} />
        ))}
      </Cluster>
      <Notice tone="info">One minute left. Wrap up your answer.</Notice>
    </Example>
  );
}

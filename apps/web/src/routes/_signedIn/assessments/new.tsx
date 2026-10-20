import { Button, Card, CoachAvatar, Container, Grid, Heading, Notice, Screen, Stack, Text } from "@fluently/ui";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { VoiceAllowance } from "../../../components/voice/VoiceCredits";
import { voiceMinutesQuery } from "../../../lib/queries";
import { useState } from "react";
import { api } from "../../../lib/api";

/** Choosing a Voice or Written Assessment. Settings links here to retake it. */
export const Route = createFileRoute("/_signedIn/assessments/new")({
  loader: ({ context }) => context.queryClient.prefetchQuery(voiceMinutesQuery),
  component: ChooseAssessment,
});

type Mode = "voice" | "written";

const modes: { mode: Mode; title: string; about: string }[] = [
  {
    mode: "voice",
    title: "Voice Assessment",
    about:
      "A live spoken conversation with your coach. It takes up to 10 minutes and measures fluency too. Find a quiet place and allow the microphone.",
  },
  {
    mode: "written",
    title: "Written Assessment",
    about:
      "Type your answers to your coach's questions, plus a few short exercises. It takes up to 10 minutes. Fluency is measured later, once you speak in a Lesson.",
  },
];

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });

function ModeCard({
  title,
  about,
  label,
  disabled,
  onClick,
}: {
  title: string;
  about: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Card>
      <Stack gap={4} align="start">
        <Heading level={2} size="title">
          {title}
        </Heading>
        <Text>{about}</Text>
        <Button onClick={onClick} disabled={disabled}>
          {label}
        </Button>
      </Stack>
    </Card>
  );
}

function ChooseAssessment() {
  const router = useRouter();
  const minutes = useQuery(voiceMinutesQuery);
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState<Mode>();
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string }>();

  async function start(mode: Mode) {
    setStarting(mode);
    setMessage(undefined);
    try {
      const response = await api().api.assessments.$post({ json: { mode } });
      if (response.status === 201) {
        const { id } = await response.json();
        return await router.navigate({ to: "/assessments/$assessmentId", params: { assessmentId: id } });
      }
      const body = (await response.json()) as { error?: string; nextAllowedAt?: string };
      if (response.status === 429 && body.nextAllowedAt)
        return setMessage({
          tone: "info",
          text: `You can take the Assessment once a week. Your next one opens on ${when(body.nextAllowedAt)}.`,
        });
      setMessage({ tone: "error", text: body.error ?? "We couldn't start your Assessment. Try again." });
    } catch {
      setMessage({ tone: "error", text: "We couldn't reach Fluently. Check your connection and try again." });
    } finally {
      setStarting(undefined);
    }
  }

  function labelFor(mode: Mode) {
    if (starting === mode) return "Starting…";
    if (mode === "written") return "Type with my coach";
    return ready ? "Join voice conversation" : "Talk with my coach";
  }

  return (
    <Screen>
      <Container width="prose">
        <Stack gap={8}>
          <Stack gap={3}>
            <CoachAvatar small />
            <Text size="label" tone="muted">
              Meet your AI coach
            </Text>
            <Heading level={1}>Voice or written?</Heading>
            <Text>
              Your coach will ask questions for up to 10 minutes to find your level and suggest Goals. Stay at least 4
              minutes for the Assessment to count.
            </Text>
          </Stack>
          <VoiceAllowance />
          {minutes.data && minutes.data.remainingSeconds > 0 && minutes.data.remainingSeconds < 240 && (
            <Notice tone="info">
              You have fewer than 4 voice minutes left. This Voice Assessment may not count. Choose Written Assessment
              to continue without voice credits.
            </Notice>
          )}
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
          {ready && (
            <Notice tone="info">
              Find a quiet spot and check your microphone. When you join, your browser will ask for permission and your
              coach will begin the conversation.
            </Notice>
          )}
          <Grid>
            {modes.map(({ mode, title, about }) => (
              <ModeCard
                key={mode}
                title={title}
                about={about}
                label={labelFor(mode)}
                disabled={
                  starting !== undefined || (mode === "voice" && (!minutes.data || minutes.data.remainingSeconds <= 0))
                }
                onClick={() => (mode === "voice" && !ready ? setReady(true) : start(mode))}
              />
            ))}
          </Grid>
        </Stack>
      </Container>
    </Screen>
  );
}

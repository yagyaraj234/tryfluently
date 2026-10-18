import { Button, Card, Container, Heading, Notice, Screen, Stack, Text } from "@impromptu/ui";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../../lib/api";

/** Choosing a Voice or Written Assessment. Settings links here to retake it. */
export const Route = createFileRoute("/_signedIn/assessments/new")({ component: ChooseAssessment });

type Mode = "voice" | "written";

const modes: { mode: Mode; title: string; about: string }[] = [
  {
    mode: "voice",
    title: "Voice Assessment",
    about: "A live spoken conversation with your coach. It takes up to 10 minutes and measures fluency too. Find a quiet place and allow the microphone.",
  },
  {
    mode: "written",
    title: "Written Assessment",
    about: "Type your answers to your coach's questions, plus a few short exercises. It takes up to 10 minutes. Fluency is measured later, once you speak in a Lesson.",
  },
];

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });

function ChooseAssessment() {
  const router = useRouter();
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
        return setMessage({ tone: "info", text: `You can take the Assessment once a week. Your next one opens on ${when(body.nextAllowedAt)}.` });
      setMessage({ tone: "error", text: body.error ?? "We couldn't start your Assessment. Try again." });
    } catch {
      setMessage({ tone: "error", text: "We couldn't reach Impromptu. Check your connection and try again." });
    } finally {
      setStarting(undefined);
    }
  }

  return (
    <Screen>
      <Container width="prose">
        <Stack gap={8}>
          <Stack gap={3}>
            <Heading level={1}>Take your Assessment</Heading>
            <Text>
              A conversation of up to 10 minutes with your coach, to find your level and the Goals that fit. Stay at least 4 minutes
              so it counts.
            </Text>
          </Stack>
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
          {modes.map(({ mode, title, about }) => (
            <Card key={mode}>
              <Stack gap={4} align="start">
                <Heading level={2} size="title">
                  {title}
                </Heading>
                <Text>{about}</Text>
                <Button onClick={() => start(mode)} disabled={starting !== undefined}>
                  {starting === mode ? "Starting…" : `Start the ${title}`}
                </Button>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Container>
    </Screen>
  );
}

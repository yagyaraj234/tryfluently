import { Button, Heading, ProgressCheckIn, Stack, Text } from "@fluently/ui";
import { Link } from "@tanstack/react-router";
import { RETAKE_DAYS } from "./constants";

type Assessments = { status: string; endedAt: string | null }[];

function Retake({ assessments, timeZone }: { assessments: Assessments; timeZone: string }) {
  const last = Math.max(
    ...assessments.filter((a) => a.status === "completed" && a.endedAt).map((a) => Date.parse(a.endedAt!)),
  );
  const opensAt = last + RETAKE_DAYS * 86_400_000;
  const locked = opensAt > Date.now();
  return (
    <Stack gap={3} align="start">
      <Button variant="secondary" render={<Link to="/assessments/new" />}>
        Retake the Assessment
      </Button>
      {locked && (
        <Text tone="muted">
          You can take the Assessment once a week. Your next Assessment opens on{" "}
          {new Date(opensAt).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone })}.
        </Text>
      )}
    </Stack>
  );
}

export function RetakeCheckIn({ assessments, timeZone }: { assessments: Assessments; timeZone: string }) {
  return (
    <ProgressCheckIn action={<Retake assessments={assessments} timeZone={timeZone} />}>
      <Text size="label" tone="muted">
        Your next check-in
      </Text>
      <Heading level={2} size="title">
        Check your level again
      </Heading>
      <Text size="caption" tone="muted">
        A new score for each skill the Assessment measures.
      </Text>
    </ProgressCheckIn>
  );
}

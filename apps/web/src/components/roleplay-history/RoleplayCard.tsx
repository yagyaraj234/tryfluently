import { Button, Card, Heading, Stack, Text } from "@fluently/ui";
import { Link } from "@tanstack/react-router";
import { roleplayKinds, type RoleplayKind } from "../roleplay/roleplay";

type Session = {
  id: string;
  title: string;
  roleplayScenario?: string | null;
  roleplayKind: string | null;
  startedAt?: string | null;
  tone: string | null;
  textMode: boolean;
  status: string;
};

function statusLabel(session: Session) {
  if (session.status === "completed") return "Completed";
  if (session.status === "abandoned") return "Abandoned";
  return session.startedAt ? "In progress" : "Ready";
}

function actionLabel(session: Session) {
  if (session.status === "completed") return "View feedback";
  if (session.status !== "in_progress") return "View session";
  return session.startedAt ? "Resume" : "Start";
}

export function RoleplayCard({ session, timezone }: { session: Session; timezone: string }) {
  const started = session.startedAt
    ? new Date(session.startedAt).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: timezone })
    : "Not started";
  const kind = roleplayKinds[session.roleplayKind as RoleplayKind] ?? "Roleplay";

  return (
    <Card>
      <Stack gap={3} align="start">
        <Heading level={2} size="title">
          {session.title}
        </Heading>
        {session.roleplayScenario && <Text tone="muted">{session.roleplayScenario}</Text>}
        <Text tone="muted">
          {started} · {kind} · {session.tone} · {session.textMode ? "Text" : "Voice"} · {statusLabel(session)}
        </Text>
        {session.status === "abandoned" && <Text tone="muted">No feedback available for this session.</Text>}
        <Button variant="secondary" render={<Link to="/roleplays/$roleplayId" params={{ roleplayId: session.id }} />}>
          {actionLabel(session)}
        </Button>
      </Stack>
    </Card>
  );
}

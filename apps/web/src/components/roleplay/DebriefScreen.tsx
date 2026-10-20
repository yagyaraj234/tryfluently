import { ChatCircleDots, Prohibit } from "@phosphor-icons/react";
import { Button, ChatTurn, Debrief, EmptyState, Stack, Text } from "@fluently/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { roadmapQuery } from "../../lib/queries";
import { hear, type DebriefData, type Roleplay } from "./roleplay";

export function Abandoned() {
  return (
    <EmptyState
      icon={Prohibit}
      title="Roleplay abandoned"
      description="It ended before completion, so there's no Debrief. Start another whenever you're ready."
      action={<Button render={<Link to="/roleplays/new" />}>Start a Roleplay</Button>}
    />
  );
}

export function Conversation({ roleplay }: { roleplay: Roleplay }) {
  const messages = roleplay.messages as unknown as UIMessage[];
  const turns = messages.map((message) => (
    <ChatTurn
      key={message.id}
      from={message.role === "user" ? "learner" : "coach"}
      name={message.role === "user" ? "You" : "Coach"}
    >
      {message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ")}
    </ChatTurn>
  ));
  return (
    <details>
      <summary>Conversation history</summary>
      <Stack gap={3}>{messages.length ? turns : <Text tone="muted">No conversation was recorded.</Text>}</Stack>
    </details>
  );
}

export function DebriefScreen({ roleplay }: { roleplay: Roleplay }) {
  const roadmap = useQuery(roadmapQuery);
  const debrief = roleplay.debrief as unknown as DebriefData;
  const finished = Boolean(
    roadmap.data?.length && roadmap.data.every((u) => u.status === "mastered" || u.status === "skipped"),
  );

  // A Roleplay that closes a Unit carries on along the Roadmap; one from setup can be played again.
  let nextAction;
  if (roleplay.unitId && finished) nextAction = <Text>Roadmap complete</Text>;
  else if (roleplay.unitId) nextAction = <Button render={<Link to="/roadmap" />}>Next Lesson</Button>;
  else nextAction = <Button render={<Link to="/roleplays/new" />}>Another Roleplay</Button>;

  const actions = (
    <>
      {nextAction}
      <Button variant="secondary" render={<Link to="/home" />}>
        Back to Home
      </Button>
    </>
  );
  const feedback = debrief ? (
    <Debrief {...debrief} onHear={hear} actions={actions} />
  ) : (
    <EmptyState icon={ChatCircleDots} title="No saved feedback" description="This session has no detailed Debrief." />
  );

  return (
    <Stack gap={4}>
      {feedback}
      <Conversation roleplay={roleplay} />
      <Button variant="secondary" render={<Link to="/roleplays" />}>
        Back to Roleplays
      </Button>
    </Stack>
  );
}

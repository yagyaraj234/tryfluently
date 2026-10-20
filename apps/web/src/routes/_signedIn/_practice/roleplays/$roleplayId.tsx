import { MagnifyingGlass } from "@phosphor-icons/react";
import { ChatSkeleton, EmptyState, ErrorState, Stack } from "@fluently/ui";
import { createFileRoute, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useState } from "react";
import { Abandoned, Conversation, DebriefScreen } from "../../../../components/roleplay/DebriefScreen";
import { fetchRoleplay, RoleplayEnding, useRoleplayEnd, type Roleplay } from "../../../../components/roleplay/roleplay";
import { TextRoleplay } from "../../../../components/roleplay/TextRoleplay";
import { VoiceRoleplay } from "../../../../components/roleplay/VoiceRoleplay";
import { voiceMinutesQuery } from "../../../../lib/queries";

/** One screen for a Roleplay from setup or one that closes a Unit: playing it, in text or by voice, then its Debrief. */
export const Route = createFileRoute("/_signedIn/_practice/roleplays/$roleplayId")({
  loader: {
    staleReloadMode: "blocking",
    handler: async ({ params, context }) => {
      const roleplay = await fetchRoleplay(params.roleplayId);
      // A spoken Roleplay shows monthly voice allowance from the first paint (and the cap, without asking for the microphone).
      if (roleplay?.status === "in_progress" && !roleplay.textMode)
        await context.queryClient.prefetchQuery(voiceMinutesQuery);
      return roleplay;
    },
  },
  component: RoleplayScreen,
  errorComponent: RoleplayError,
  pendingComponent: RoleplayPending,
});

function RoleplayPending() {
  return <ChatSkeleton label="Loading your Roleplay" />;
}

function RoleplayError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const description = error instanceof Error ? error.message : undefined;
  return (
    <ErrorState
      title="Your Roleplay couldn't be loaded"
      description={description}
      onRetry={() => router.invalidate()}
    />
  );
}

function RoleplayScreen() {
  const roleplay = Route.useLoaderData();
  if (!roleplay)
    return (
      <EmptyState
        icon={MagnifyingGlass}
        title="We couldn't find that Roleplay"
        description="It may belong to another account."
      />
    );
  if (roleplay.status === "completed") return <DebriefScreen roleplay={roleplay} />;
  if (roleplay.status === "abandoned")
    return (
      <Stack gap={4}>
        <Abandoned />
        <Conversation roleplay={roleplay} />
      </Stack>
    );
  return <InProgress key={roleplay.id} roleplay={roleplay} />;
}

/** The mode seam: a text Roleplay is a chat, a spoken one a live call. */
function InProgress({ roleplay }: { roleplay: Roleplay }) {
  // A Roleplay not yet spoken in can still be typed instead (the first message switches it to text on the server).
  const [typing, setTyping] = useState(false);
  const session = useRoleplayEnd(roleplay.id);

  if (roleplay.textMode || typing)
    return session.ending === "running" ? (
      <TextRoleplay roleplay={roleplay} onEnd={() => void session.end()} />
    ) : (
      <RoleplayEnding {...session} />
    );

  const spoken = (roleplay.messages as unknown[]).length > 0;
  return (
    <VoiceRoleplay roleplay={roleplay} session={session} onTypeInstead={spoken ? undefined : () => setTyping(true)} />
  );
}

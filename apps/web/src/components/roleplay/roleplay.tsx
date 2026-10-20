import { Button, Cluster, ErrorState, LoadingState, Text, toastManager, type DebriefProps } from "@fluently/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import { api } from "../../lib/api";

export type RoleplayKind =
  "mock_interview" | "client_call" | "presentation" | "team_meeting" | "phone_call" | "small_talk" | "custom";
export type Tone = "friendly" | "standard" | "tough";

export const roleplayKinds: Record<RoleplayKind, string> = {
  mock_interview: "Mock Interview",
  client_call: "Client Call",
  presentation: "Presentation",
  team_meeting: "Team Meeting",
  phone_call: "Phone Call",
  small_talk: "Small Talk",
  custom: "Custom Roleplay",
};
export const roleplayOptions = (Object.entries(roleplayKinds) as [RoleplayKind, string][])
  .filter(([value]) => value !== "custom")
  .map(([value, label]) => ({ value, label }));
export const tones: Record<Tone, string> = { friendly: "Friendly", standard: "Standard", tough: "Tough" };
export const characters: Record<RoleplayKind, string> = {
  mock_interview: "Interviewer",
  client_call: "Client",
  presentation: "Audience member",
  team_meeting: "Teammate",
  phone_call: "Caller",
  small_talk: "Conversation partner",
  custom: "Counterpart",
};

type Client = ReturnType<typeof api>["api"]["lessons"][":id"];
export type Roleplay = InferResponseType<Client["$get"], 200>;
export type DebriefData = Omit<DebriefProps, "onHear" | "actions">;

export async function fetchRoleplay(id: string) {
  const response = await api().api.lessons[":id"].$get({ param: { id } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Couldn't load your Roleplay (${response.status})`);
  const roleplay = await response.json();
  return roleplay.kind === "roleplay" ? roleplay : null;
}

export const roleplayLabel = (r: Pick<Roleplay, "roleplayKind" | "tone">) =>
  `${roleplayKinds[r.roleplayKind as RoleplayKind]} · ${tones[r.tone as Tone]}`;

export type Ending = "running" | "ending" | "failed";

export function useRoleplayEnd(roleplayId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [ending, setEnding] = useState<Ending>("running");

  async function end() {
    setEnding("ending");
    try {
      const response = await api().api.roleplays[":id"].end.$post({ param: { id: roleplayId } });
      // 409: it already ended (another tab); reloading shows where it got to.
      if (!response.ok && (response.status as number) !== 409) return setEnding("failed");
      void queryClient.invalidateQueries();
      await router.invalidate();
    } catch {
      setEnding("failed");
    }
  }

  return { ending, end };
}

export function RoleplayEnding({ ending, end }: ReturnType<typeof useRoleplayEnd>) {
  if (ending === "failed")
    return (
      <ErrorState
        title="We couldn't write your Debrief"
        description="Your Roleplay is saved. Try again in a moment."
        onRetry={() => void end()}
        retryLabel="Write my Debrief"
      />
    );
  return (
    <LoadingState
      title="Writing your Debrief…"
      description="Your coach is reading the whole conversation. This takes up to a minute."
    />
  );
}

export function RoleplayBar({
  roleplay,
  onEnd,
  disabled,
}: {
  roleplay: Roleplay;
  onEnd: () => void;
  disabled?: boolean;
}) {
  return (
    <Cluster justify="between">
      <Text size="label">{roleplayLabel(roleplay)}</Text>
      <Button variant="secondary" onClick={onEnd} disabled={disabled}>
        End
      </Button>
    </Cluster>
  );
}

export const coachIntro = (kind: RoleplayKind) =>
  `Say hello to start. Your ${characters[kind].toLowerCase()} stays in character until you end the ${roleplayKinds[kind]}. Your Debrief comes after.`;

export function hear(text: string) {
  new Audio(`/api/pronunciation?${new URLSearchParams({ text })}`)
    .play()
    .catch(() => toastManager.add({ title: "We couldn't play that", description: "Try again in a moment." }));
}

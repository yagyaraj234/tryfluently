import { Button, Cluster, ErrorState, LoadingState, Text, toastManager, type DebriefProps } from "@impromptu/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import { api } from "./api";
import { progressQuery, roadmapQuery } from "./queries";

// What text and voice Roleplays share: names, the bar at the top, ending through /end and the wait for the Debrief.
// #95's voice Roleplay uses these too.

export type RoleplayKind = "mock_interview" | "client_call";
export type Tone = "friendly" | "standard" | "tough";

export const roleplayKinds: Record<RoleplayKind, string> = { mock_interview: "Mock Interview", client_call: "Client Call" };
export const tones: Record<Tone, string> = { friendly: "Friendly", standard: "Standard", tough: "Tough" };
/** Who the coach plays, as screen readers announce their lines. */
export const characters: Record<RoleplayKind, string> = { mock_interview: "Interviewer", client_call: "Client" };

type Client = ReturnType<typeof api>["api"]["lessons"][":id"];
export type Roleplay = InferResponseType<Client["$get"], 200>;
export type DebriefData = Omit<DebriefProps, "onHear" | "actions">;

/** The Roleplay, or null when it isn't the Learner's (or isn't a Roleplay). */
export async function fetchRoleplay(id: string) {
  const response = await api().api.lessons[":id"].$get({ param: { id } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Couldn't load your Roleplay (${response.status})`);
  const roleplay = await response.json();
  return roleplay.kind === "roleplay" ? roleplay : null;
}

/** "Mock Interview · Tough" */
export const roleplayLabel = (r: Pick<Roleplay, "roleplayKind" | "tone">) =>
  `${roleplayKinds[r.roleplayKind as RoleplayKind]} · ${tones[r.tone as Tone]}`;

export type Ending = "running" | "ending" | "failed";

/**
 * Ends a Roleplay through /end. While the Debrief is written it's "ending"; a 502 makes it "failed", and `end` can be
 * called again. Once it's over the route reloads and shows the Debrief (or that it was abandoned).
 */
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
      void queryClient.invalidateQueries({ queryKey: roadmapQuery.queryKey });
      void queryClient.invalidateQueries({ queryKey: progressQuery.queryKey });
      await router.invalidate();
    } catch {
      setEnding("failed");
    }
  }

  return { ending, end };
}

/** The wait while the Debrief is written, or a retry when it couldn't be. */
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
  return <LoadingState title="Writing your Debrief…" description="Your coach is reading the whole conversation. This takes up to a minute." />;
}

/** The top of a Roleplay in text: its kind and tone, and End. #95 shows the LiveBar instead while a call is live. */
export function RoleplayBar({ roleplay, onEnd, disabled }: { roleplay: Roleplay; onEnd: () => void; disabled?: boolean }) {
  return (
    <Cluster justify="between">
      <Text size="label">{roleplayLabel(roleplay)}</Text>
      <Button variant="secondary" onClick={onEnd} disabled={disabled}>
        End
      </Button>
    </Cluster>
  );
}

/** Plays a phrase's Reference Pronunciation. */
export function hear(text: string) {
  new Audio(`/api/pronunciation?${new URLSearchParams({ text })}`)
    .play()
    .catch(() => toastManager.add({ title: "We couldn't play that", description: "Try again in a moment." }));
}

import { Button, EmptyState, ErrorState, LoadingState } from "@impromptu/ui";
import { MapTrifold } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../../lib/api";
import { roadmapQuery } from "../../lib/queries";

/** Shown on Home and the Roadmap when there's no Roadmap yet, usually because building it failed: try again. */
export function BuildRoadmap() {
  const queryClient = useQueryClient();
  const build = useMutation({
    mutationFn: async () => {
      const response = await api().api.roadmap.$post();
      // 409 is "already built" or "not ready yet"; refetching shows the Roadmap in the first case.
      if (response.ok || response.status === 409) {
        await queryClient.invalidateQueries(roadmapQuery);
        return response.status === 409 ? "notReady" : "built";
      }
      throw new Error(`Couldn't build your Roadmap (${response.status})`);
    },
  });

  if (build.isPending)
    return <LoadingState title="Building your Roadmap" description="Planning your Units from your Goals and your Assessment." />;
  if (build.isError)
    return (
      <ErrorState
        title="Your Roadmap couldn't be built"
        description="That's on us. Try again in a moment."
        retryLabel="Build my Roadmap"
        onRetry={() => build.mutate()}
      />
    );
  if (build.data === "notReady")
    return (
      <EmptyState
        icon={MapTrifold}
        title="Set your Goals first"
        description="Your Roadmap is built from your confirmed Goals and your Assessment."
        action={<Button render={<Link to="/goals" />}>Set your Goals</Button>}
      />
    );
  return (
    <EmptyState
      icon={MapTrifold}
      title="Your Roadmap isn't ready"
      description="We couldn't plan your Units last time. Try again and we'll build it now."
      action={<Button onClick={() => build.mutate()}>Build my Roadmap</Button>}
    />
  );
}

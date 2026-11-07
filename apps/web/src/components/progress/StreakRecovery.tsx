import { Button, Card, Heading, Notice, Stack, Text, TextLink } from "@fluently/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../../lib/api";
import { progressQuery } from "../../lib/queries";

export function StreakRecovery() {
  const data = useQuery(progressQuery).data;
  const queryClient = useQueryClient();
  const restore = useMutation({
    mutationFn: async () => {
      const response = await api().api.progress.restore.$post();
      if (!response.ok) {
        const body = await response.json();
        throw new Error("error" in body ? String(body.error) : "Your streak couldn't be restored. Try again.");
      }
    },
    onSuccess: () => queryClient.invalidateQueries(progressQuery),
  });
  if (restore.isSuccess) return <Notice tone="info">Your streak has been restored.</Notice>;
  if (!data?.restorableDays?.length || !data.recovery) return null;
  return (
    <Card>
      <Stack gap={3} align="start">
        <Heading level={2} size="title">
          Keep your streak going
        </Heading>
        <Text>
          Restore {data.restorableDays.length} missed {data.restorableDays.length === 1 ? "day" : "days"}. Recovery adds
          no Lesson completions or XP.
        </Text>
        {!data.recovery.hasPro ? (
          <TextLink render={<Link to="/profile" />}>Unlock Pro for streak recovery</TextLink>
        ) : data.recovery.available ? (
          <Button disabled={restore.isPending} onClick={() => restore.mutate()}>
            {restore.isPending ? "Restoring…" : "Restore streak"}
          </Button>
        ) : (
          <Text tone="muted">
            Recovery is available again{" "}
            {new Date(data.recovery.nextAvailableAt).toLocaleString("en", { timeZone: "UTC" })} UTC.
          </Text>
        )}
        {restore.error && <Notice tone="error">{restore.error.message}</Notice>}
      </Stack>
    </Card>
  );
}

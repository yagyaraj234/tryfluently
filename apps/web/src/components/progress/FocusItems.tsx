import { Target } from "@phosphor-icons/react";
import { Card, Cluster, EmptyState, FocusItemCard, Grid, Heading, Stack, Text } from "@fluently/ui";
import { focusItemsQuery } from "../../lib/queries";
import { HITS_TO_CLOSE } from "./constants";

type FocusItem = Awaited<ReturnType<NonNullable<typeof focusItemsQuery.queryFn>>>[number];

export function FocusItems({ items }: { items: FocusItem[] }) {
  const open = items.filter((item) => item.status === "open").length;
  const closed = items.filter((item) => item.status === "closed").length;
  const sorted = [...items].sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed"));

  const body = items.length ? (
    <Grid columns={3}>
      {sorted.map((item) => (
        <FocusItemCard
          key={item.id}
          label={item.label}
          kind={item.kind}
          status={item.status}
          hits={item.hits}
          hitsToClose={HITS_TO_CLOSE}
        />
      ))}
    </Grid>
  ) : (
    <Card>
      <EmptyState
        icon={Target}
        title="No Focus Items yet"
        description="Focus Items come from your Assessment Report, Debriefs and repeated mistakes."
      />
    </Card>
  );

  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <Cluster justify="between">
          <Heading level={2} size="title">
            Focus Items
          </Heading>
          <Text size="caption" tone="muted">
            {open} open · {closed} closed
          </Text>
        </Cluster>
        <Text size="caption" tone="muted">
          Repeated mistakes to fix. Three correct uses close one.
        </Text>
      </Stack>
      {body}
    </Stack>
  );
}

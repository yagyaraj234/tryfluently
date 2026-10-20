import { Progress } from "@base-ui/react/progress";
import { Check } from "@phosphor-icons/react";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { labelledBarParts } from "./ProgressBar";
import { Stack } from "./Stack";
import { Text } from "./Text";

const kinds = { grammar: "Grammar", vocabulary: "Vocabulary", phrase: "Phrase" };

export type FocusItemCardProps = {
  label: string;
  kind: keyof typeof kinds;
  status: "open" | "closed";
  hits: number;
  hitsToClose: number;
};

function HitsProgress({ hits, hitsToClose }: { hits: number; hitsToClose: number }) {
  return (
    <Progress.Root className={labelledBarParts.root()} value={hits} max={hitsToClose}>
      <Progress.Label className={labelledBarParts.label()}>
        {hits} of {hitsToClose} correct uses to close it
      </Progress.Label>
      <Progress.Track className={labelledBarParts.track()}>
        <Progress.Indicator className={labelledBarParts.indicator()} />
      </Progress.Track>
    </Progress.Root>
  );
}

export function FocusItemCard({ label, kind, status, hits, hitsToClose }: FocusItemCardProps) {
  const state =
    status === "closed" ? (
      <div>
        <Chip tone="soft" icon={Check}>
          Closed
        </Chip>
      </div>
    ) : (
      <HitsProgress hits={hits} hitsToClose={hitsToClose} />
    );
  return (
    <Card>
      <Stack gap={3}>
        <Text size="label" tone="muted">
          {kinds[kind]}
        </Text>
        <Text size="title">{label}</Text>
        {state}
      </Stack>
    </Card>
  );
}

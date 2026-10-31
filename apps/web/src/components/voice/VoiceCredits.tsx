import { MicrophoneSlash } from "@phosphor-icons/react";
import { EmptyState, ErrorState, LoadingState, Stack, Text, TextLink } from "@fluently/ui";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { voiceMinutesQuery } from "../../lib/queries";
import { resetsOn, voiceTime } from "../../lib/voiceMinutes";

type Budget = Awaited<ReturnType<NonNullable<typeof voiceMinutesQuery.queryFn>>>;

export function VoicePlans() {
  return (
    <Text tone="muted">
      Free includes 25 live minutes each month. Pro includes 150 minutes per billing period; purchased minutes never
      expire. <TextLink render={<Link to="/profile" />}>View plans or add minutes</TextLink>.
    </Text>
  );
}

export function VoiceAllowance() {
  const minutes = useQuery(voiceMinutesQuery);
  return (
    <Stack gap={3}>
      {minutes.data ? (
        <>
          <Text tabular>
            {voiceTime(minutes.data.monthlyRemainingSeconds ?? minutes.data.remainingSeconds)} of{" "}
            {minutes.data.limitMinutes} monthly minutes left.
          </Text>
          <Text tabular>
            {voiceTime(minutes.data.purchasedRemainingSeconds ?? 0)} purchased minutes left. No expiry.
          </Text>
          <Text tone="muted">Renews {resetsOn(minutes.data.resetsAt)}.</Text>
        </>
      ) : minutes.isError ? (
        <ErrorState description="We couldn't load your voice minutes." onRetry={() => void minutes.refetch()} />
      ) : (
        <Text tone="muted">Loading voice minutes…</Text>
      )}
      <VoicePlans />
    </Stack>
  );
}

export function VoiceLimit({
  budget,
  description,
  action,
}: {
  budget?: Partial<Budget>;
  description?: string;
  action?: ReactNode;
}) {
  const minutes = useQuery(voiceMinutesQuery);
  const allowance = budget ?? minutes.data;
  return (
    <Stack gap={3}>
      <EmptyState
        icon={MicrophoneSlash}
        title="You've used your available voice minutes"
        description={`${allowance?.resetsAt ? `Your voice minutes renew ${resetsOn(allowance.resetsAt)}. ` : ""}${description ?? "You can continue with text instead."}`}
        action={action}
      />
      <VoicePlans />
    </Stack>
  );
}

/** Admit once: later quota polls must not unmount a call before its transcript is saved. */
export function VoiceAccess({ children, capped }: { children: ReactNode; capped: ReactNode }) {
  const minutes = useQuery(voiceMinutesQuery);
  const [admitted, setAdmitted] = useState(false);
  if (!admitted) {
    if (!minutes.data)
      return minutes.isError ? (
        <ErrorState description="We couldn't check your voice minutes." onRetry={() => void minutes.refetch()} />
      ) : (
        <LoadingState title="Checking your voice minutes" />
      );
    if (minutes.data.remainingSeconds <= 0) return capped;
    setAdmitted(true);
  }
  return children;
}

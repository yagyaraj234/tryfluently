import { MicrophoneSlash } from "@phosphor-icons/react";
import { EmptyState, ErrorState, LoadingState, Stack, Text, TextLink } from "@fluently/ui";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { voiceMinutesQuery } from "../../lib/queries";
import { resetsOn, voiceTime } from "../../lib/voiceMinutes";

type Budget = Awaited<ReturnType<NonNullable<typeof voiceMinutesQuery.queryFn>>>;

export function BetaVoiceCredits() {
  return (
    <Text tone="muted">
      We're in beta. Every account includes 10 free voice minutes each month. Email{" "}
      <TextLink render={<a href="mailto:hey@yagyaraj.com" />}>hey@yagyaraj.com</TextLink> to request more voice credits.
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
            {voiceTime(minutes.data.remainingSeconds)} of {minutes.data.limitMinutes} minutes left this month.
          </Text>
          <Text tone="muted">Renews {resetsOn(minutes.data.resetsAt)}.</Text>
        </>
      ) : minutes.isError ? (
        <ErrorState description="We couldn't load your voice minutes." onRetry={() => void minutes.refetch()} />
      ) : (
        <Text tone="muted">Loading voice minutes…</Text>
      )}
      <BetaVoiceCredits />
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
        title="You've used this month's voice minutes"
        description={`${allowance?.resetsAt ? `Your voice minutes renew ${resetsOn(allowance.resetsAt)}. ` : ""}${description ?? "You can continue with text instead."}`}
        action={action}
      />
      <BetaVoiceCredits />
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

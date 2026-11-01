import {
  Button,
  Card,
  Cluster,
  Dialog,
  ErrorState,
  Grid,
  Heading,
  LoadingState,
  Notice,
  Stack,
  Text,
  TextLink,
} from "@fluently/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, errorOf } from "../../lib/api";
import { billingQuery, voiceMinutesQuery } from "../../lib/queries";
import { VoiceAllowance } from "../voice/VoiceCredits";

export function BillingCard({ paymentReturn = false }: { paymentReturn?: boolean }) {
  const billing = useQuery(billingQuery);
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(paymentReturn);
  useEffect(() => {
    if (!paymentReturn) return;
    const refresh = () => {
      void queryClient.invalidateQueries(billingQuery);
      void queryClient.invalidateQueries(voiceMinutesQuery);
    };
    refresh();
    const timer = setInterval(refresh, 3_000);
    const stop = setTimeout(() => {
      clearInterval(timer);
      setCheckingPayment(false);
    }, 30_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [paymentReturn, queryClient]);
  const purchase = useMutation({
    mutationFn: async (kind: "pro" | "pack") => {
      const response = await api().api.billing.checkout.$post({ json: { kind } });
      if (!response.ok) throw await errorOf(response, "Checkout is unavailable. Please try again.");
      const body = await response.json();
      if (!("url" in body)) throw new Error("Checkout is unavailable. Please try again.");
      return body.url;
    },
    onSuccess: (url) => window.location.assign(url),
  });
  const portal = useMutation({
    mutationFn: async () => {
      const response = await api().api.billing.portal.$post();
      if (!response.ok) throw await errorOf(response, "Billing is unavailable. Please try again.");
      return response.json();
    },
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const cancel = useMutation({
    mutationFn: async () => {
      const response = await api().api.billing.cancel.$post();
      if (!response.ok) throw await errorOf(response, "Cancellation failed. Please try again.");
    },
    onSuccess: () => {
      setConfirmCancel(false);
      void queryClient.invalidateQueries(billingQuery);
    },
  });
  const busy = purchase.isPending || portal.isPending || cancel.isPending;
  const failure = purchase.error ?? portal.error ?? cancel.error;
  const data = billing.data;

  return (
    <Card>
      <Stack gap={6}>
        <Stack gap={2}>
          <Heading level={2} size="title">
            Your plan & minutes
          </Heading>
          <Text tone="muted">Monthly minutes first. Purchased minutes stay yours until you use them.</Text>
        </Stack>
        {!data ? (
          billing.isError ? (
            <ErrorState description={billing.error.message} onRetry={() => void billing.refetch()} />
          ) : (
            <LoadingState title="Loading your plan" />
          )
        ) : (
          <>
            {paymentReturn && (
              <Notice tone="info">
                {checkingPayment ? "Checking your payment…" : "Your payment status is shown below."} Paid minutes appear
                only after payment is confirmed. Some bank payments take longer. If your balance hasn't updated, refresh
                later or contact support.
              </Notice>
            )}
            <Text>
              {data.source === "subscription"
                ? "Pro subscription"
                : data.source === "pack"
                  ? "Pro access from your minute pack"
                  : "Free plan"}
            </Text>
            {data.paidUntil && (
              <Text tone="muted">
                Subscription benefits through {new Date(data.paidUntil).toLocaleString("en", { timeZone: "UTC" })} UTC.
              </Text>
            )}
            {data.source === "pack" && (
              <Text tone="muted">All Pro features stay unlocked while your purchased balance is above zero.</Text>
            )}
            <VoiceAllowance />
            <Text>
              {data.lessons.limit === null
                ? "No daily Lesson limit."
                : `${Math.max(0, data.lessons.limit - data.lessons.used)} of ${data.lessons.limit} new Lessons left today. Resets ${new Date(data.lessons.resetsAt).toLocaleString("en", { timeZone: "UTC" })} UTC.`}{" "}
              Resuming and reviewing Lessons is always available.
            </Text>
            {!data.enabled && (
              <Notice tone="info">
                Paid checkout is currently unavailable. Your existing access and balances are shown here.
              </Notice>
            )}
            <Grid columns={2}>
              <Stack gap={3}>
                <Heading level={3} size="title">
                  Pro · $9/month
                </Heading>
                <Text>
                  150 live minutes each billing period, unlimited Lessons, Lesson and Unit skipping, and streak
                  recovery.
                </Text>
                <Text tone="muted">
                  Tax included. Renews monthly until cancelled. Unused monthly minutes don't roll over.
                </Text>
                <Button
                  disabled={busy || !data.enabled || Boolean(data.subscription)}
                  onClick={() => purchase.mutate("pro")}
                >
                  {purchase.isPending && purchase.variables === "pro"
                    ? "Opening checkout…"
                    : data.subscription
                      ? "Subscription on file"
                      : "Subscribe to Pro"}
                </Button>
              </Stack>
              <Stack gap={3}>
                <Heading level={3} size="title">
                  Minute pack · $29 once
                </Heading>
                <Text>
                  500 live minutes. Buy again whenever you need more. No expiry, including after your subscription ends.
                </Text>
                <Text tone="muted">
                  Tax included. All Pro features while purchased minutes remain. No automatic top-up.
                </Text>
                <Button variant="secondary" disabled={busy || !data.enabled} onClick={() => purchase.mutate("pack")}>
                  {purchase.isPending && purchase.variables === "pack" ? "Opening checkout…" : "Add 500 minutes"}
                </Button>
              </Stack>
            </Grid>
            <Text tone="muted">
              USD prices. Local-currency totals and any conversion charges are shown before payment. Recorded Lesson
              answers have a separate daily allowance.
            </Text>
            {data.canManage && (
              <Cluster>
                <Button variant="secondary" disabled={busy || !data.enabled} onClick={() => portal.mutate()}>
                  {portal.isPending ? "Opening billing…" : "Invoices & payment methods"}
                </Button>
                {data.subscription && !data.subscription.cancelAtPeriodEnd && (
                  <Button variant="secondary" disabled={busy || !data.enabled} onClick={() => setConfirmCancel(true)}>
                    Cancel subscription
                  </Button>
                )}
              </Cluster>
            )}
            {data.subscription?.cancelAtPeriodEnd && (
              <Notice tone="info">
                Your subscription will end after its paid period. Purchased minutes and learning history remain.
              </Notice>
            )}
            {failure && <Notice tone="error">{failure.message}</Notice>}
            <Text tone="muted">
              Billing or refund request?{" "}
              <TextLink render={<a href="mailto:hey@yagyaraj.com" />}>Contact support</TextLink>. Refunds are reviewed
              manually.
            </Text>
          </>
        )}
        <Dialog
          open={confirmCancel}
          onOpenChange={(open) => !cancel.isPending && setConfirmCancel(open)}
          title="Cancel your subscription?"
          description="You keep Pro until the paid period ends. Purchased minutes never expire and continue unlocking Pro while their balance is positive."
        >
          <Stack gap={3}>
            {cancel.error && <Notice tone="error">{cancel.error.message}</Notice>}
            <Button disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              {cancel.isPending ? "Cancelling…" : "Cancel renewal"}
            </Button>
            <Button variant="secondary" disabled={cancel.isPending} onClick={() => setConfirmCancel(false)}>
              Keep subscription
            </Button>
          </Stack>
        </Dialog>
      </Stack>
    </Card>
  );
}

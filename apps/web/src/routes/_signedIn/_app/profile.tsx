import { Cluster, Dashboard, Stack } from "@fluently/ui";
import { createFileRoute } from "@tanstack/react-router";
import { PublicLinks } from "../../../components/landing/PublicLinks";
import { AccountCard } from "../../../components/profile/AccountCard";
import { PreferencesCard } from "../../../components/profile/PreferencesCard";
import { ProfileSummary } from "../../../components/profile/ProfileSummary";
import { BillingCard } from "../../../components/profile/BillingCard";
import { billingQuery, roadmapQuery, skillProfileQuery, voiceMinutesQuery } from "../../../lib/queries";

export const Route = createFileRoute("/_signedIn/_app/profile")({
  staticData: { title: "Profile" },
  validateSearch: (search: Record<string, unknown>): { payment?: "return" } => ({
    payment: search.payment === "return" ? "return" : undefined,
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.prefetchQuery(roadmapQuery),
      context.queryClient.prefetchQuery(voiceMinutesQuery),
      context.queryClient.prefetchQuery(skillProfileQuery),
      context.queryClient.prefetchQuery(billingQuery),
    ]),
  component: Profile,
});

function Profile() {
  const { theme, learner } = Route.useRouteContext();
  const { payment } = Route.useSearch();
  return (
    <Dashboard
      main={
        <Stack gap={6}>
          <PreferencesCard theme={theme} timezone={learner.timezone} />
          <BillingCard paymentReturn={payment === "return"} />
          <AccountCard />
          <nav aria-label="Legal and support">
            <Cluster gap={4}>
              <PublicLinks />
            </Cluster>
          </nav>
        </Stack>
      }
      rail={<ProfileSummary name={learner.name} />}
    />
  );
}

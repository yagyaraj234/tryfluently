import { Card, Cluster, Dashboard, Heading, Stack } from "@fluently/ui";
import { createFileRoute } from "@tanstack/react-router";
import { PublicLinks } from "../../../components/landing/PublicLinks";
import { AccountCard } from "../../../components/profile/AccountCard";
import { PreferencesCard } from "../../../components/profile/PreferencesCard";
import { ProfileSummary } from "../../../components/profile/ProfileSummary";
import { VoiceAllowance } from "../../../components/voice/VoiceCredits";
import { roadmapQuery, skillProfileQuery, voiceMinutesQuery } from "../../../lib/queries";

export const Route = createFileRoute("/_signedIn/_app/profile")({
  staticData: { title: "Profile" },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.prefetchQuery(roadmapQuery),
      context.queryClient.prefetchQuery(voiceMinutesQuery),
      context.queryClient.prefetchQuery(skillProfileQuery),
    ]),
  component: Profile,
});

function Profile() {
  const { theme, learner } = Route.useRouteContext();
  return (
    <Dashboard
      main={
        <Stack gap={6}>
          <PreferencesCard theme={theme} timezone={learner.timezone} />
          <Card>
            <Stack gap={4}>
              <Heading level={2} size="title">
                Free plan
              </Heading>
              <VoiceAllowance />
            </Stack>
          </Card>
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

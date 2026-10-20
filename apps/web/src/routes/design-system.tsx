import { Button, Container, Heading, Screen, Stack, Text, TextLink, TokenReference } from "@fluently/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ActionsAndDisplay, LayoutAndShells, Typography } from "../components/design-system/BasicSections";
import { FeedbackSection } from "../components/design-system/FeedbackSection";
import { FormsSection } from "../components/design-system/FormsSection";
import { LearningPreview } from "../components/design-system/LearningPreview";
import { OverlaysSection } from "../components/design-system/OverlaysSection";
import { AppShellPreview, PracticeShellPreview } from "../components/design-system/Previews";
import { ProgressSection } from "../components/design-system/ProgressSection";
import { DebriefSection, LessonCompleteSection, ReportSection } from "../components/design-system/ReportSections";
import { StepsSection } from "../components/design-system/StepsSection";
import { ThemeChips } from "../components/design-system/ThemeChips";
import { VoiceSection } from "../components/design-system/VoiceSection";

export const Route = createFileRoute("/design-system")({
  validateSearch: (search: Record<string, unknown>) => ({
    preview:
      search.preview === "app" || search.preview === "practice" || search.preview === "learning"
        ? search.preview
        : undefined,
  }),
  head: () => ({ meta: [{ title: "Design System · Fluently" }, { name: "robots", content: "noindex" }] }),
  component: Guide,
});

function Guide() {
  const { preview } = Route.useSearch();
  const { theme } = Route.useRouteContext();

  if (preview === "learning") return <LearningPreview theme={theme} />;
  if (preview === "app") return <AppShellPreview />;
  if (preview === "practice") return <PracticeShellPreview />;

  return (
    <Screen>
      <Container width="prose">
        <Stack gap={10}>
          <Stack gap={4}>
            <Text size="label">Fluently · one theme for the landing page and the app</Text>
            <Heading level={1}>Design System</Heading>
            <Text>Real components and live tokens.</Text>
            <ThemeChips theme={theme} />
            <Text tone="muted">
              Switch themes to review every example. Tab through controls to inspect focus; open overlays to check
              keyboard behaviour.
            </Text>
          </Stack>
          <Button render={<Link to="/design-system" search={{ preview: "learning" }} />}>
            Preview the learning experience
          </Button>
          <TokenReference />
          <Typography />
          <LayoutAndShells />
          <ActionsAndDisplay />
          <FormsSection />
          <OverlaysSection />
          <FeedbackSection />
          <StepsSection />
          <VoiceSection />
          <ProgressSection />
          <ReportSection />
          <DebriefSection />
          <LessonCompleteSection />
          <Text tone="muted">
            Motion: 80ms presses, 160ms overlays, one short celebration. Reduced motion keeps all content and removes
            movement. Actions here use example content; no microphone or AI calls.
          </Text>
          <TextLink render={<Link to="/" />}>Open Fluently</TextLink>
        </Stack>
      </Container>
    </Screen>
  );
}

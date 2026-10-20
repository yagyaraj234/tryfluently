import { AppShell, Button, Cluster, Heading, PracticeShell, StreakChip, Text, XpChip } from "@impromptu/ui";
import { House, MapTrifold } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

const guideLink = <Link to="/design-system" search={{ preview: undefined }} />;
const backToGuide = <Button render={guideLink}>Back to guide</Button>;

export function AppShellPreview() {
  return (
    <AppShell
      destinations={[
        { label: "Home", icon: House, render: <Link to="/design-system" search={{ preview: "app" }} /> },
        { label: "Roadmap", icon: MapTrifold, render: guideLink },
      ]}
      status={
        <Cluster>
          <StreakChip days={7} />
          <XpChip xp={250} />
        </Cluster>
      }
    >
      <Heading level={1}>AppShell preview</Heading>
      <Text>Bottom navigation on phone. Sidebar at 64rem.</Text>
      {backToGuide}
    </AppShell>
  );
}

export function PracticeShellPreview() {
  return (
    <PracticeShell closeRender={guideLink}>
      <Heading level={1}>PracticeShell preview</Heading>
      <Text>No navigation. Close returns to the guide.</Text>
      {backToGuide}
    </PracticeShell>
  );
}

import { Feature, MarketingPanel, UnitRow } from "@fluently/ui";
import { ChatCircle, Path, Sparkle } from "@phosphor-icons/react";

export function RoadmapSection() {
  return (
    <Feature
      id="roadmap"
      flip
      pill="Roadmap"
      title="Lessons with a clear next step"
      description="Your Goals shape the outline. Each Lesson uses earlier performance to prepare short reading Pages and a Quiz."
      points={[
        {
          icon: Path,
          title: "Complete at your own pace",
          body: "A Unit completes when you finish every Lesson in its outline.",
        },
        {
          icon: ChatCircle,
          title: "Practice where you need it",
          body: "Review your Quiz feedback, try a Practice Round or request a Follow-up Lesson.",
        },
      ]}
    >
      <MarketingPanel
        road
        label="An example Roadmap with one completed Unit, one in progress and one up next"
        top={
          <>
            <Sparkle aria-hidden weight="fill" />
            Lesson content adapts to earlier practice
          </>
        }
      >
        <UnitRow state="done" index={1} title="Introducing yourself" detail="All Lessons finished" status="Completed" />
        <UnitRow
          state="now"
          index={2}
          title="Past tense for everyday stories"
          detail="Lesson 2 of 3"
          status="In progress"
          progress
        />
        <UnitRow
          state="next"
          index={3}
          title="Telling a story about your week"
          detail="Conversation Unit"
          status="Up next"
        />
      </MarketingPanel>
    </Feature>
  );
}

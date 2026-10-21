import { Feature, MarketingPanel, UnitRow } from "@fluently/ui";
import { ChatCircle, Path, Sparkle } from "@phosphor-icons/react";

export function RoadmapSection() {
  return (
    <Feature
      id="roadmap"
      flip
      pill="Roadmap"
      title="A Roadmap that changes as you improve"
      description="Your Roadmap is a list of Units, each made of short Lessons. Your coach builds each Lesson from your Goals and how you did in earlier Lessons."
      points={[
        {
          icon: Path,
          title: "Progress through each Unit",
          body: "Complete all the outlined Lessons to finish a Unit. Your next Lesson adapts to what needs practice.",
        },
        {
          icon: ChatCircle,
          title: "Voice and text Steps",
          body: "Each Lesson mixes speaking and writing prompts with feedback on every response.",
        },
      ]}
    >
      <MarketingPanel
        road
        label="A Roadmap with one completed Unit, one in progress and one up next"
        top={
          <>
            <Sparkle aria-hidden weight="fill" />
            Updated after every Lesson
          </>
        }
      >
        <UnitRow
          state="done"
          index={1}
          title="Introducing yourself"
          detail="All Lessons completed"
          status="Completed"
        />
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

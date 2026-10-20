import { Feature, MarketingPanel, UnitRow } from "@fluently/ui";
import { ChatCircle, Path, Sparkle } from "@phosphor-icons/react";

export function RoadmapSection() {
  return (
    <Feature
      id="roadmap"
      flip
      pill="Roadmap"
      title="A Roadmap that changes as you improve"
      description="Your Roadmap is a list of Units, each made of short Lessons. Your coach builds each Lesson from how you did in the last one, so you skip what you already know."
      points={[
        {
          icon: Path,
          title: "Mastered after two Lessons",
          body: "A Unit is mastered when you hit its goal in two Lessons in a row.",
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
        label="A Roadmap with one mastered Unit, one in progress and one up next"
        top={
          <>
            <Sparkle aria-hidden weight="fill" />
            Updated after every Lesson
          </>
        }
      >
        <UnitRow state="done" index={1} title="Introducing yourself" detail="Mastered in 2 Lessons" status="Mastered" />
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

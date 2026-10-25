import { Feature, LevelCard, MarketingPanel } from "@fluently/ui";
import { ChartBar, Check, Microphone, Sparkle } from "@phosphor-icons/react";

export function AssessmentSection() {
  return (
    <Feature
      id="assessment"
      pill="Assessment"
      title="Find your starting point"
      description="An AI estimate of your English, with examples of what to practise next. It is not an official CEFR test."
      points={[
        {
          icon: ChartBar,
          title: "Your level and what to fix",
          body: "Estimated levels for measured skills, with specific corrections.",
        },
        {
          icon: Microphone,
          title: "Voice or written",
          body: "Voice estimates spoken fluency. Written assesses grammar and vocabulary.",
        },
      ]}
    >
      <MarketingPanel
        label="Skill levels on the A1 to C2 scale with a target for each skill"
        top={
          <>
            <Sparkle aria-hidden weight="fill" />
            Target set for your Goal
          </>
        }
        bottom={
          <>
            <Check aria-hidden />
            Takes up to 10 minutes
          </>
        }
      >
        <LevelCard skill="Fluency" current="B1" target="B2" />
        <LevelCard skill="Grammar" current="B2" target="B2" />
        <LevelCard skill="Vocabulary" current="B1" target="C1" />
      </MarketingPanel>
    </Feature>
  );
}

import { Feature, LevelCard, MarketingPanel } from "@fluently/ui";
import { ChartBar, Check, Microphone, Sparkle } from "@phosphor-icons/react";

export function AssessmentSection() {
  return (
    <Feature
      id="assessment"
      pill="Assessment"
      title="See where you stand in 10 minutes"
      description="Have a short conversation by voice or text. Get estimated CEFR levels for grammar and vocabulary, plus fluency when you speak."
      points={[
        {
          icon: ChartBar,
          title: "Your level and what to fix",
          body: "Estimated levels from A1 to C2, plus the specific mistakes to correct first.",
        },
        {
          icon: Microphone,
          title: "Voice or written",
          body: "Speak if you want fluency measured. Type if you are somewhere quiet.",
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

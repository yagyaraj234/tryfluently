import { FeatureTrio } from "@impromptu/ui";
import { FileText, Flame, Microphone } from "@phosphor-icons/react";

export function MoreWaysSection() {
  return (
    <FeatureTrio
      id="more"
      title="More ways to practise"
      items={[
        {
          icon: FileText,
          title: "Bring your own context",
          body: "Tell Impromptu about your work or situation. It turns that into a short brief and uses it in every Lesson.",
        },
        {
          icon: Microphone,
          title: "Hear the correct pronunciation",
          body: "Tap any vocabulary card or correction to play it.",
        },
        {
          icon: Flame,
          title: "Keep the streak",
          body: "Short daily Lessons earn XP and build a Streak, so ten minutes a day adds up.",
        },
      ]}
    />
  );
}

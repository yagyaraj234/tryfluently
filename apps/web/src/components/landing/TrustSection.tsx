import { FeatureTrio } from "@fluently/ui";
import { ChartBar, Eye, ShieldCheck } from "@phosphor-icons/react";

export function TrustSection() {
  return (
    <FeatureTrio
      id="trust"
      title="Useful feedback. Honest limits."
      items={[
        {
          icon: Eye,
          title: "See what practice looks like",
          body: "Product previews illustrate Lessons, feedback and Roleplays. They are examples, not learner results or testimonials.",
        },
        {
          icon: ChartBar,
          title: "Estimates, not certificates",
          body: "AI estimates CEFR levels from your answers. Written Assessments measure grammar and vocabulary, not spoken fluency. Scores can be wrong; progress and time to improve vary.",
        },
        {
          icon: ShieldCheck,
          title: "Control your learning data",
          body: "Voice is optional. Fluently saves transcripts, not your raw voice recordings. Delete your account and linked learning records from Profile. See Privacy for provider processing and retention.",
        },
      ]}
    />
  );
}

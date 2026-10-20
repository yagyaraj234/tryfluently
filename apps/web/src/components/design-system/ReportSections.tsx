import { Debrief, LessonComplete, ReportStrengths, ReportWeakness, Button, Switch } from "@impromptu/ui";
import { useState } from "react";
import { Example, sample } from "./shared";

export function ReportSection() {
  return (
    <Example title="Assessment Report">
      <ReportStrengths
        strengths={[
          "Your ideas follow a clear order.",
          "You use specific examples.",
          "You explain familiar topics confidently.",
        ]}
      />
      <ReportWeakness
        label="Experience that continues today"
        quote="I work here since 2023."
        betterVersion="I've worked here since 2023."
      />
    </Example>
  );
}

export function DebriefSection() {
  const [textMode, setTextMode] = useState(false);
  return (
    <Example title="Debrief">
      <Switch label="Text-mode Debrief" checked={textMode} onCheckedChange={setTextMode} />
      <Debrief
        textMode={textMode}
        overallImpression="You explained your work clearly. Practise connecting your ideas with examples."
        questions={[
          {
            question: "Tell me about a project.",
            quote: "I make a tool for team.",
            strongerPhrasing: "I built a tool for my team.",
            languageIssues: ["Use past simple for finished work."],
          },
        ]}
        phrasesToLearn={["I was responsible for…", "One challenge was…", "The result was…"]}
        skillChanges={{ grammar: { from: 46, to: 48 }, vocabulary: { from: null, to: 50 } }}
        onHear={sample}
      />
    </Example>
  );
}

export function LessonCompleteSection() {
  return (
    <section aria-label="Lesson complete preview">
      <LessonComplete xpGained={60} streak={7} actions={<Button onClick={sample}>Next Lesson</Button>} />
    </section>
  );
}

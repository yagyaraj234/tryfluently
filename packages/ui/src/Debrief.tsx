import { SpeakerHigh } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { Card } from "./Card";
import { Heading } from "./Heading";
import { Notice } from "./Notice";
import { skillNames, type Skill } from "./SkillBar";
import { Text } from "./Text";

const column = cva("flex flex-col gap-8");
const group = cva("flex flex-col gap-4");
const inCard = cva("flex flex-col gap-3");
const quote = cva("rounded-xl bg-subtle px-4 py-3 text-body text-ink");
const stronger = cva("text-body font-bold text-ink");
const bullets = cva("flex list-disc flex-col gap-1 pl-5 text-caption text-ink");
const rows = cva("flex flex-col gap-3");
const row = cva("flex flex-wrap items-center justify-between gap-3 text-body text-ink");
const score = cva("font-bold tabular-nums");
const actionRow = cva("flex flex-wrap gap-3");

export type DebriefQuestion = {
  question: string;
  quote: string;
  strongerPhrasing: string;
  languageIssues: string[];
};

export type DebriefProps = {
  textMode?: boolean;
  overallImpression: string;
  questions: DebriefQuestion[];
  phrasesToLearn: string[];
  skillChanges: Partial<Record<Skill, SkillChange>>;
  onHear?: (phrase: string) => void;
  actions?: ReactNode;
};

type SkillChange = { from: number | null; to: number };

function QuestionCard({ q }: { q: DebriefQuestion }) {
  const issues =
    q.languageIssues.length > 0 ? (
      <ul aria-label="Language issues" className={bullets()}>
        {q.languageIssues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    ) : null;
  return (
    <Card render={<section />}>
      <div className={inCard()}>
        <Heading level={3}>{q.question}</Heading>
        <Text size="label" tone="muted">
          You said
        </Text>
        <blockquote className={quote()}>{q.quote}</blockquote>
        <Text size="label" tone="muted">
          Stronger
        </Text>
        <p className={stronger()}>{q.strongerPhrasing}</p>
        {issues}
      </div>
    </Card>
  );
}

function PhrasesCard({ phrases, onHear }: { phrases: string[]; onHear?: (phrase: string) => void }) {
  const items = phrases.map((phrase) => {
    const hear = onHear ? (
      <Button variant="secondary" icon={SpeakerHigh} onClick={() => onHear(phrase)}>
        Hear it
      </Button>
    ) : null;
    return (
      <li key={phrase} className={row()}>
        <strong>{phrase}</strong>
        {hear}
      </li>
    );
  });
  return (
    <Card>
      <div className={group()}>
        <Heading level={2} size="title">
          Phrases to learn
        </Heading>
        <ul aria-label="Phrases to learn" className={rows()}>
          {items}
        </ul>
      </div>
    </Card>
  );
}

function SkillChangesCard({ changes }: { changes: [Skill, SkillChange][] }) {
  if (changes.length === 0) return null;
  return (
    <Card>
      <div className={group()}>
        <Heading level={2} size="title">
          Your skills
        </Heading>
        <ul aria-label="Skill changes" className={rows()}>
          {changes.map(([skill, { from, to }]) => (
            <li key={skill} className={row()}>
              <span>{skillNames[skill]}</span>
              <span className={score()}>{`${from ?? "New"} → ${to}`}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function Debrief({
  textMode,
  overallImpression,
  questions,
  phrasesToLearn,
  skillChanges,
  onHear,
  actions,
}: DebriefProps) {
  const changes = Object.entries(skillChanges) as [Skill, SkillChange][];
  return (
    <div className={column()}>
      <div className={group()}>
        <Heading level={1}>Your Debrief</Heading>
        {textMode && <Notice tone="info">Text mode · Fluency wasn't measured in this Roleplay.</Notice>}
        <Text>{overallImpression}</Text>
      </div>

      <div className={group()}>
        <Heading level={2}>Question by question</Heading>
        {questions.map((q) => (
          <QuestionCard key={q.question} q={q} />
        ))}
      </div>

      <PhrasesCard phrases={phrasesToLearn} onHear={onHear} />
      <SkillChangesCard changes={changes} />
      {actions && <div className={actionRow()}>{actions}</div>}
    </div>
  );
}

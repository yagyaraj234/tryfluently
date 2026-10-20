import {
  Button,
  CefrScale,
  Cluster,
  FocusItemCard,
  Grid,
  ProfileCard,
  ScoreHistory,
  SkillBar,
  StatTile,
  StreakCard,
  StreakChip,
  UnitCard,
  WeekStrip,
  XpChip,
} from "@impromptu/ui";
import { Books, CheckCircle } from "@phosphor-icons/react";
import { Example, sample } from "./shared";

const unitStatuses = ["planned", "active", "mastered", "skipped"] as const;
const skills = ["fluency", "grammar", "vocabulary"] as const;
const week = ["12", "13", "14", "15", "16", "17", "18"].map((d) => ({
  day: `2026-10-${d}`,
  practised: d < "15",
  today: d === "15",
}));

export function ProgressSection() {
  return (
    <Example title="Roadmap and progress">
      {unitStatuses.map((status) => (
        <UnitCard
          key={status}
          title={`Telling your story · ${status}`}
          objective="Describe your experience with clear past tenses."
          status={status}
        />
      ))}
      <UnitCard
        number={3}
        skill="grammar"
        title="Tenses for projects"
        objective="Talk about past projects with the right tense."
        status="active"
        progress={{ value: 64, lessonsDone: 2 }}
        action={<Button onClick={sample}>Resume Lesson</Button>}
      />
      <ProfileCard
        name="Asha Rao"
        levels={[
          { skill: "grammar", level: "B2" },
          { skill: "vocabulary", level: "B1" },
        ]}
        streak={12}
        xp={340}
        unitsMastered={1}
      />
      <WeekStrip week={week} />
      <Grid columns={2}>
        <StatTile icon={CheckCircle} value={3} label="Lessons done" />
        <StatTile icon={Books} value={1} label="Unit in progress" />
      </Grid>
      {skills.map((skill) => (
        <SkillBar key={skill} skill={skill} score={55} level="B2" />
      ))}
      <CefrScale label="CEFR scale preview" level="B2" />
      <ScoreHistory
        label="Grammar history preview"
        entries={[
          { id: "a", date: "16 Oct 2026", score: 46, level: "B1", source: "assessment" },
          { id: "l", date: "18 Oct 2026", score: 51, level: "B2", source: "lesson" },
        ]}
      />
      <FocusItemCard label="Past simple vs present perfect" kind="grammar" status="open" hits={2} hitsToClose={3} />
      <FocusItemCard label="Let me clarify that" kind="phrase" status="closed" hits={3} hitsToClose={3} />
      <StreakCard days={7} />
      <Cluster>
        <StreakChip days={7} />
        <XpChip xp={250} />
      </Cluster>
    </Example>
  );
}

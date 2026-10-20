import {
  Chip,
  ChoiceChips,
  CoachCall,
  FillGapsStep,
  LessonStage,
  PracticeShell,
  ReorderStep,
  RoadmapNode,
  RoadmapUnit,
  Stack,
  StepFeedback,
  StepHeader,
  TeachingPage,
} from "@impromptu/ui";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ThemeChips } from "./ThemeChips";

type Feedback = "correct" | "incorrect" | undefined;
type Coach = "ready" | "listening" | "thinking" | "speaking";

const options = ["roadmap", "teaching", "blanks", "reorder", "voice"].map((value) => ({
  value,
  label: value[0]!.toUpperCase() + value.slice(1),
}));
const coachOptions = ["ready", "listening", "thinking", "speaking"].map((value) => ({ value, label: value }));

function RoadmapView({ onOpen }: { onOpen: () => void }) {
  return (
    <Stack gap={10}>
      <RoadmapUnit
        number={1}
        title="Tell your story"
        description="Introduce yourself with confidence"
        detail={<Chip>Active</Chip>}
      >
        <RoadmapNode state="complete" title="A clear introduction" onClick={onOpen} />
        <RoadmapNode state="active" title="Words for your experience" skill="vocabulary" onClick={onOpen} />
        <RoadmapNode state="locked" title="Past projects, clear timelines" skill="grammar" />
        <RoadmapNode state="locked" title="Explain your impact" skill="fluency" />
      </RoadmapUnit>
      <RoadmapUnit
        number={2}
        title="Make your ideas heard"
        description="Explain ideas clearly in a conversation"
        detail={<Chip>Planned</Chip>}
      >
        <RoadmapNode state="locked" title="Choose precise verbs" skill="vocabulary" />
        <RoadmapNode state="locked" title="Connect cause and effect" skill="grammar" />
        <RoadmapNode state="locked" title="Pitch an idea" skill="fluency" />
      </RoadmapUnit>
    </Stack>
  );
}

function PracticeView({
  view,
  feedback,
  setFeedback,
  next,
}: {
  view: "blanks" | "reorder";
  feedback: Feedback;
  setFeedback: (feedback: Feedback) => void;
  next: () => void;
}) {
  const blanks = view === "blanks";
  let body;
  if (feedback)
    body = (
      <StepFeedback
        verdict={feedback}
        corrected="Could you send the notes, please?"
        explanation="‘Could you’ makes a clear, polite request."
        nextLabel="Continue"
        onNext={next}
      />
    );
  else if (blanks)
    body = (
      <FillGapsStep
        sentence="___ you send the notes, ___?"
        choices={["please", "Could"]}
        onAnswer={(answer) => setFeedback(answer === '["Could","please"]' ? "correct" : "incorrect")}
      />
    );
  else
    body = (
      <ReorderStep
        items={["the notes,", "Could you", "please?", "send"]}
        onAnswer={(answer) => setFeedback(answer === "[1,3,0,2]" ? "correct" : "incorrect")}
      />
    );

  return (
    <LessonStage>
      <StepHeader
        type={blanks ? "Fill the blanks" : "Put it in order"}
        question={blanks ? "Complete the two requests." : "Arrange a polite request."}
      />
      {body}
    </LessonStage>
  );
}

type VoiceState = {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  coach: Coach;
  setCoach: (coach: Coach) => void;
};

function VoiceView({ muted, setMuted, coach, setCoach, onEnd }: VoiceState & { onEnd: () => void }) {
  return (
    <>
      <ChoiceChips
        label="Preview coach state"
        value={coach}
        options={coachOptions}
        onValueChange={(value) => setCoach(value as Coach)}
      />
      <CoachCall
        state={coach}
        connection="live"
        muted={muted}
        onMutedChange={setMuted}
        onEnd={onEnd}
        speaker="coach"
        caption="Tell me about a situation where you’d like to feel more confident speaking English."
      />
    </>
  );
}

export function LearningPreview({ theme }: { theme: string | undefined }) {
  const [view, setView] = useState("roadmap");
  const [feedback, setFeedback] = useState<Feedback>();
  const [muted, setMuted] = useState(false);
  const [coach, setCoach] = useState<Coach>("ready");
  const next = () => {
    setFeedback(undefined);
    setView("teaching");
  };

  let body;
  if (view === "roadmap") body = <RoadmapView onOpen={() => setView("teaching")} />;
  else if (view === "teaching")
    body = (
      <TeachingPage
        title="A small change. A clearer request."
        body="A request gives the other person room to respond. Start with ‘Could you’ and say what you need. Add a little context when it helps."
        example="Could you share the notes before our call?"
        onNext={() => setView("blanks")}
      />
    );
  else if (view === "blanks" || view === "reorder")
    body = <PracticeView view={view} feedback={feedback} setFeedback={setFeedback} next={next} />;
  else if (view === "voice") body = <VoiceView {...{ muted, setMuted, coach, setCoach }} onEnd={next} />;

  return (
    <PracticeShell
      title="Learning experience · example content"
      closeRender={<Link to="/design-system" search={{ preview: undefined }} />}
    >
      <Stack gap={6}>
        <ChoiceChips
          label="Preview screen"
          options={options}
          value={view}
          onValueChange={(value) => {
            setView(value);
            setFeedback(undefined);
          }}
        />
        <ThemeChips theme={theme} />
        {body}
      </Stack>
    </PracticeShell>
  );
}

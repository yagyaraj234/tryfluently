import {
  CoachCall, LessonStage, RoadmapNode, RoadmapUnit, TeachingPage, FillGapsStep, ReorderStep,
  AnswerBox, AppShell, Button, Card, CefrScale, ChatTurn, Chip, ChoiceChips, Cluster, Container, Debrief, Dialog,
  EmptyState, ErrorState, FillGapStep, FocusItemCard, Grid, Heading, IconButton, LessonComplete, LiveBar, LoadingState, VoiceOrb,
  Menu, Meter, Notice, OfflineBanner, PracticeShell, ProfileCard, ProgressBar, RecordButton, ReportStrengths, ReportWeakness,
  RewriteStep, ScoreHistory, Screen, Select, Sheet, Skeleton, SkillBar, SpeakPromptStep, Spinner, Split, Stack,
  StatTile, StepFeedback, StepHeader, StreakCard, StreakChip, Switch, Text, TextArea, TextField, TextLink, TokenReference,
  UnitCard, VocabCardStep, VerdictTag, VoiceAnswer, WeekStrip, XpChip, toastManager, type RecordingState, type TextSize,
} from "@impromptu/ui";
import { Books, CheckCircle, DotsThree, House, MapTrifold, Microphone, SpeakerHigh } from "@phosphor-icons/react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { saveTheme, type Theme } from "../lib/theme";

export const Route = createFileRoute("/design-system")({
  validateSearch: (search: Record<string, unknown>) => ({
    preview: search.preview === "app" || search.preview === "practice" || search.preview === "learning" ? search.preview : undefined,
  }),
  head: () => ({ meta: [{ title: "Design System · Impromptu" }, { name: "robots", content: "noindex" }] }),
  component: Guide,
});

const themes = ["Light", "Dark", "System"].map((label) => ({ label, value: label.toLowerCase() }));
const sample = () => toastManager.add({ title: "Preview action", description: "This guide uses example content." });
const answered = (answer: string) => toastManager.add({ title: "Answer received", description: answer });

function Example({ title, children }: { title: string; children: ReactNode }) {
  return <Card render={<section />}><Stack gap={5}><Heading level={2}>{title}</Heading>{children}</Stack></Card>;
}

function Guide() {
  const { preview } = Route.useSearch();
  const { theme } = Route.useRouteContext();
  const router = useRouter();
  const [textMode, setTextMode] = useState(false);

  const home = <Button render={<Link to="/design-system" search={{ preview: undefined }} />}>Back to guide</Button>;
  if (preview === "learning") return <LearningPreview />;
  if (preview === "app") return (
    <AppShell destinations={[
      { label: "Home", icon: House, render: <Link to="/design-system" search={{ preview: "app" }} /> },
      { label: "Roadmap", icon: MapTrifold, render: <Link to="/design-system" search={{ preview: undefined }} /> },
    ]} status={<Cluster><StreakChip days={7} /><XpChip xp={250} /></Cluster>}>
      <Heading level={1}>AppShell preview</Heading><Text>Bottom navigation on phone. Sidebar at 64rem.</Text>{home}
    </AppShell>
  );
  if (preview === "practice") return (
    <PracticeShell closeRender={<Link to="/design-system" search={{ preview: undefined }} />}>
      <Heading level={1}>PracticeShell preview</Heading><Text>No navigation. Close returns to the guide.</Text>{home}
    </PracticeShell>
  );

  async function pickTheme(value: string) {
    saveTheme(value as Theme);
    await router.invalidate();
  }

  return (
    <Screen>
      <Container width="prose">
        <Stack gap={10}>
          <Stack gap={4}>
            <Text size="label">Impromptu · one theme for the landing page and the app</Text>
            <Heading level={1}>Design System</Heading>
            <Text>Real components and live tokens.</Text>
            <ChoiceChips label="Preview theme" options={themes} value={theme ?? "system"} onValueChange={pickTheme} />
            <Text tone="muted">Switch themes to review every example. Tab through controls to inspect focus; open overlays to check keyboard behaviour.</Text>
          </Stack>
          <Button render={<Link to="/design-system" search={{ preview: "learning" }} />}>Preview the learning experience</Button>
          <TokenReference />
          <Example title="Typography">
            {(["label", "caption", "body", "title", "heading", "page", "hero"] as TextSize[]).map((size) => <Text key={size} size={size}>{size} · Speak with confidence</Text>)}
            <Text tabular>Tabular numbers · 0123456789</Text>
            <Heading level={3}>Heading level 3</Heading>
          </Example>
          <Example title="Layout and shells">
            <Text>Screen sets the page background and gutters. Stack arranges vertically, Cluster wraps, Container limits reading width. Split stacks on phone and uses two thirds / one third at 64rem.</Text>
            <Split main={<Card><Text>Main content</Text></Card>} side={<Card><Text>Side content</Text></Card>} />
            <Cluster>
              <Button variant="secondary" render={<Link to="/design-system" search={{ preview: "app" }} />}>Preview AppShell</Button>
              <Button variant="secondary" render={<Link to="/design-system" search={{ preview: "practice" }} />}>Preview PracticeShell</Button>
            </Cluster>
            <Text>UIProvider at the page root supplies icons, overlays and toasts.</Text>
          </Example>
          <Example title="Actions and display">
            <Cluster>
              <Button onClick={sample}>Primary action</Button><Button variant="secondary" icon={SpeakerHigh} onClick={sample}>Secondary action</Button>
              <Button disabled>Disabled</Button><IconButton icon={Microphone} label="Microphone preview" onClick={sample} />
              <TextLink onClick={sample}>TextLink</TextLink>
            </Cluster>
            <Button fullWidth onClick={sample}>Full-width action</Button>
            <Card render={<Link to="/design-system" search={{ preview: "app" }} />}><Text>Card rendered as a link</Text></Card>
            <Cluster><Chip>Paper chip</Chip><Chip tone="soft" icon={House}>Soft chip</Chip>
              {(["correct", "almost", "incorrect"] as const).map((verdict) => <VerdictTag key={verdict} verdict={verdict} />)}
            </Cluster>
          </Example>
          <Forms />
          <Overlays />
          <Example title="Feedback and system states">
            <ProgressBar label="Lesson progress" value={3} max={7} /><Meter label="Unit objective" value={65} max={100} />
            <Spinner label="Loading preview" /><Skeleton shape="text" /><Skeleton shape="block" size={14} /><Skeleton shape="circle" size={10} />
            <Notice tone="info">Your answers are saved.</Notice><Notice tone="error">We couldn't save that. Try again.</Notice>
            <OfflineBanner />
            <LoadingState title="Preparing your next Step" description="Each Step builds on how you did on the last one." />
            <EmptyState title="No Focus Items yet" description="They appear after an Assessment or Lesson." />
            <ErrorState title="Your Step couldn't be loaded" description="Your answers so far are saved." onRetry={sample} />
            <EmptyState title="You've used today's voice minutes" description="They're back at midnight. You can type instead." action={<Button onClick={sample}>Type instead</Button>} />
            <Notice tone="info">Your next Assessment opens in 7 days. Keep practising with Lessons.</Notice>
          </Example>
          <Steps />
          <Voice />
          <Example title="Roadmap and progress">
            {(["planned", "active", "mastered", "skipped"] as const).map((status) => <UnitCard key={status} title={`Telling your story · ${status}`} objective="Describe your experience with clear past tenses." status={status} />)}
            <UnitCard number={3} skill="grammar" title="Tenses for projects" objective="Talk about past projects with the right tense." status="active" progress={{ value: 64, lessonsDone: 2 }} action={<Button onClick={sample}>Resume Lesson</Button>} />
            <ProfileCard name="Asha Rao" levels={[{ skill: "grammar", level: "B2" }, { skill: "vocabulary", level: "B1" }]} streak={12} xp={340} unitsMastered={1} />
            <WeekStrip week={["12", "13", "14", "15", "16", "17", "18"].map((d) => ({ day: `2026-10-${d}`, practised: d < "15", today: d === "15" }))} />
            <Grid columns={2}><StatTile icon={CheckCircle} value={3} label="Lessons done" /><StatTile icon={Books} value={1} label="Unit in progress" /></Grid>
            {(["fluency", "grammar", "vocabulary"] as const).map((skill) => <SkillBar key={skill} skill={skill} score={55} level="B2" />)}
            <CefrScale label="CEFR scale preview" level="B2" />
            <ScoreHistory label="Grammar history preview" entries={[
              { id: "a", date: "16 Oct 2026", score: 46, level: "B1", source: "assessment" },
              { id: "l", date: "18 Oct 2026", score: 51, level: "B2", source: "lesson" },
            ]} />
            <FocusItemCard label="Past simple vs present perfect" kind="grammar" status="open" hits={2} hitsToClose={3} />
            <FocusItemCard label="Let me clarify that" kind="phrase" status="closed" hits={3} hitsToClose={3} />
            <StreakCard days={7} /><Cluster><StreakChip days={7} /><XpChip xp={250} /></Cluster>
          </Example>
          <Example title="Assessment Report">
            <ReportStrengths strengths={["Your ideas follow a clear order.", "You use specific examples.", "You explain familiar topics confidently."]} />
            <ReportWeakness label="Experience that continues today" quote="I work here since 2023." betterVersion="I've worked here since 2023." />
          </Example>
          <Example title="Debrief">
            <Switch label="Text-mode Debrief" checked={textMode} onCheckedChange={setTextMode} />
            <Debrief textMode={textMode} overallImpression="You explained your work clearly. Practise connecting your ideas with examples."
              questions={[{ question: "Tell me about a project.", quote: "I make a tool for team.", strongerPhrasing: "I built a tool for my team.", languageIssues: ["Use past simple for finished work."] }]}
              phrasesToLearn={["I was responsible for…", "One challenge was…", "The result was…"]}
              skillChanges={{ grammar: { from: 46, to: 48 }, vocabulary: { from: null, to: 50 } }} onHear={sample} />
          </Example>
          <section aria-label="Lesson complete preview"><LessonComplete xpGained={60} streak={7} actions={<Button onClick={sample}>Next Lesson</Button>} /></section>
          <Text tone="muted">Motion: 80ms presses, 160ms overlays, one short celebration. Reduced motion keeps all content and removes movement. Actions here use example content; no microphone or AI calls.</Text>
          <TextLink render={<Link to="/" />}>Open Impromptu</TextLink>
        </Stack>
      </Container>
    </Screen>
  );
}

function Forms() {
  return (
    <Example title="Forms">
      <TextField label="Goal Context title" description="A short label for your situation." defaultValue="My next interview" />
      <TextField label="Email error state" type="email" defaultValue="asha" error="Enter an email address, such as asha@example.com." />
      <TextField label="Disabled field" defaultValue="Saved value" disabled />
      <TextArea label="Goal Context" rows={3} description="0 / 20,000 characters" />
      <ChoiceChips label="Single choice" options={[{ value: "voice", label: "Speak" }, { value: "text", label: "Type" }]} defaultValue="voice" />
      <ChoiceChips multiple label="Multiple choice" options={[{ value: "job", label: "Job Interview" }, { value: "client", label: "Client Communication" }]} defaultValue={["job"]} />
      <Select label="Target Level" options={[{ value: "B1", label: "B1" }, { value: "B2", label: "B2" }, { value: "C1", label: "C1" }]} defaultValue="B2" />
      <Select label="Disabled select" options={[{ value: "B2", label: "B2" }]} defaultValue="B2" disabled />
      <Switch label="Switch preview" defaultChecked /><Switch label="Disabled switch" disabled />
    </Example>
  );
}

function Overlays() {
  const [open, setOpen] = useState<"dialog" | "sheet">();
  return (
    <Example title="Overlays and toasts">
      <Cluster>
        <Button onClick={() => setOpen("dialog")}>Open Dialog</Button><Button variant="secondary" onClick={() => setOpen("sheet")}>Open Sheet</Button>
        <Menu trigger={<IconButton icon={DotsThree} label="Open Menu" />} items={[{ label: "Example action", onSelect: sample }]} />
        <Button variant="secondary" onClick={() => toastManager.add({ title: "Saved", description: "Your preference was saved.", actionProps: { children: "Undo", onClick: sample } })}>Show Toast</Button>
      </Cluster>
      <Dialog open={open === "dialog"} onOpenChange={(v) => !v && setOpen(undefined)} title="Dialog preview" description="Tab stays inside. Escape closes and returns focus to the trigger.">
        <Button onClick={() => setOpen(undefined)}>Close Dialog</Button>
      </Dialog>
      <Sheet open={open === "sheet"} onOpenChange={(v) => !v && setOpen(undefined)} title="Sheet preview" description="Bottom sheet on phone, centred dialog on desktop.">
        <Button onClick={() => setOpen(undefined)}>Close Sheet</Button>
      </Sheet>
    </Example>
  );
}

function Steps() {
  return (
    <Example title="Lesson Steps">
      <StepHeader type="Vocabulary" question="Use this word in your own sentence." progress={{ position: 2, total: 7 }} />
      <VocabPreview />
      <StepHeader type="Fill the gap" question="Choose the missing words." />
      <FillGapStep sentence="I ___ here since 2023." choices={["work", "have worked", "working"]} onAnswer={answered} />
      <FillGapStep sentence="Yesterday I ___ a client." onAnswer={answered} />
      <FillGapStep sentence="Yesterday I ___ a client." answered="called" onAnswer={answered} />
      <StepHeader type="Rewrite" question="Make this sentence clearer." />
      <RewriteStep sentence="I make a tool for team." onAnswer={answered} />
      <AnswerBox label="Pending answer" pending onAnswer={answered} />
      {(["correct", "almost", "incorrect"] as const).map((verdict) => <StepFeedback key={verdict} verdict={verdict} answer="I work here since 2023." corrected="I've worked here since 2023." explanation="Use present perfect for something that started in the past and continues now." onNext={sample} onHearIt={sample} />)}
      <ChatTurn from="coach" name="Interviewer">Tell me about a project you enjoyed.</ChatTurn><ChatTurn from="learner">I built a tool for my team.</ChatTurn>
    </Example>
  );
}

function VocabPreview() {
  return <VocabCardStep word="clarify" meaning="Make something easier to understand." example="Could you clarify the next step?" onHearIt={sample} onAnswer={answered} />;
}

function Voice() {
  const [recording, setRecording] = useState<RecordingState>({ status: "idle" });
  const [muted, setMuted] = useState(false);
  const voice = { recording, onStart: () => setRecording({ status: "recording", seconds: 12, level: 0.6 }), onStop: () => setRecording({ status: "done", text: "I built a tool for my team." }), onRetry: () => setRecording({ status: "idle" }) };
  const states = ["idle", "recording", "processing", "done", "failed", "silent", "capped", "denied", "no-microphone", "unsupported"];
  function pick(value: string) {
    if (value === "recording") return voice.onStart();
    if (value === "done") return voice.onStop();
    if (value === "failed" || value === "silent") return setRecording({ status: "failed", reason: value });
    if (value === "capped" || value === "denied" || value === "no-microphone" || value === "unsupported") return setRecording({ status: "unavailable", reason: value });
    setRecording({ status: value as "idle" | "processing" });
  }
  return (
    <Example title="Voice and recording">
      <Select label="Recording preview state" options={states.map((s) => ({ value: s, label: s }))} defaultValue="idle" onValueChange={pick} />
      <SpeakPromptStep key={recording.status} targetSeconds={60} {...voice} onAnswer={answered} />
      <VoiceAnswer label="Recorded vocabulary sentence" {...voice} prefer="text" onAnswer={answered} />
      <Cluster>{(["idle", "recording", "processing"] as const).map((state) => <RecordButton key={state} state={state} onStart={voice.onStart} onStop={voice.onStop} />)}</Cluster>
      {(["connecting", "live", "reconnecting"] as const).map((state) => <LiveBar key={state} state={state} title="Mock Interview · Standard" elapsed={120_000} left={60_000} muted={muted} onMutedChange={setMuted} onEnd={sample} />)}
      <Cluster>{(["connecting", "ready", "listening", "thinking", "speaking"] as const).map((phase) => <VoiceOrb key={phase} phase={phase} label={phase} />)}</Cluster>
      <Notice tone="info">One minute left. Wrap up your answer.</Notice>
    </Example>
  );
}


function LearningPreview() {
  const [view, setView] = useState("roadmap");
  const [feedback, setFeedback] = useState<"correct" | "incorrect">();
  const [muted, setMuted] = useState(false);
  const [coach, setCoach] = useState<"ready" | "listening" | "thinking" | "speaking">("ready");
  const router = useRouter();
  const { theme } = Route.useRouteContext();
  const options = ["roadmap", "teaching", "blanks", "reorder", "voice"].map((value) => ({ value, label: value[0]!.toUpperCase() + value.slice(1) }));
  const next = () => { setFeedback(undefined); setView("teaching"); };
  return <PracticeShell title="Learning experience · example content" closeRender={<Link to="/design-system" search={{ preview: undefined }} />}>
    <Stack gap={6}>
      <ChoiceChips label="Preview screen" options={options} value={view} onValueChange={(value) => { setView(value); setFeedback(undefined); }} />
      <ChoiceChips label="Preview theme" options={themes} value={theme ?? "system"} onValueChange={async (value) => { saveTheme(value as Theme); await router.invalidate(); }} />
      {view === "roadmap" && <Stack gap={10}>
        <RoadmapUnit number={1} title="Tell your story" description="Introduce yourself with confidence" detail={<Chip>Active</Chip>}>
          <RoadmapNode state="complete" title="A clear introduction" onClick={() => setView("teaching")} />
          <RoadmapNode state="active" title="Words for your experience" skill="vocabulary" onClick={() => setView("teaching")} />
          <RoadmapNode state="locked" title="Past projects, clear timelines" skill="grammar" />
          <RoadmapNode state="locked" title="Explain your impact" skill="fluency" />
        </RoadmapUnit>
        <RoadmapUnit number={2} title="Make your ideas heard" description="Explain ideas clearly in a conversation" detail={<Chip>Planned</Chip>}>
          <RoadmapNode state="locked" title="Choose precise verbs" skill="vocabulary" />
          <RoadmapNode state="locked" title="Connect cause and effect" skill="grammar" />
          <RoadmapNode state="locked" title="Pitch an idea" skill="fluency" />
        </RoadmapUnit>
      </Stack>}
      {view === "teaching" && <TeachingPage title="A small change. A clearer request." body="A request gives the other person room to respond. Start with ‘Could you’ and say what you need. Add a little context when it helps." example="Could you share the notes before our call?" onNext={() => setView("blanks")} />}
      {(view === "blanks" || view === "reorder") && <LessonStage>
        <StepHeader type={view === "blanks" ? "Fill the blanks" : "Put it in order"} question={view === "blanks" ? "Complete the two requests." : "Arrange a polite request."} />
        {feedback ? <StepFeedback verdict={feedback} corrected="Could you send the notes, please?" explanation="‘Could you’ makes a clear, polite request." nextLabel="Continue" onNext={next} />
          : view === "blanks" ? <FillGapsStep sentence="___ you send the notes, ___?" choices={["please", "Could"]} onAnswer={(answer) => setFeedback(answer === '["Could","please"]' ? "correct" : "incorrect")} />
          : <ReorderStep items={["the notes,", "Could you", "please?", "send"]} onAnswer={(answer) => setFeedback(answer === "[1,3,0,2]" ? "correct" : "incorrect")} />}
      </LessonStage>}
      {view === "voice" && <><ChoiceChips label="Preview coach state" value={coach} options={["ready", "listening", "thinking", "speaking"].map((value) => ({ value, label: value }))} onValueChange={(value) => setCoach(value as typeof coach)} /><CoachCall state={coach} connection="live" muted={muted} onMutedChange={setMuted} onEnd={next} speaker="coach" caption="Tell me about a situation where you’d like to feel more confident speaking English." /></>}
    </Stack>
  </PracticeShell>;
}

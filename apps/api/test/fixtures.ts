import { get, json, makeApp, makeClock, mockChat, mockModel, signUp, userMessage, type TestApp } from "./helpers";

const makeClockFn = makeClock;

export const reportReply = (over: Record<string, unknown> = {}) => ({
  overallLevel: "B1",
  skills: {
    grammar: { score: 42, evidence: ["I have went to Pune last year"] },
    vocabulary: { score: 55, evidence: ["we leverage synergies"] },
  },
  strengths: ["Clear structure", "Good range of work vocabulary", "Confident tone"],
  weaknesses: [
    { label: "Past simple vs present perfect", kind: "grammar", quote: "I have went to Pune last year", betterVersion: "I went to Pune last year" },
    { label: "Articles before job titles", kind: "grammar", quote: "I am engineer", betterVersion: "I am an engineer" },
    { label: "Overused 'very'", kind: "vocabulary", quote: "very very good", betterVersion: "excellent" },
  ],
  proposedGoals: [{ kind: "job_interview", targetLevels: { fluency: "B2", grammar: "B2", vocabulary: "C1" } }],
  firstUnit: { title: "Talking about past projects", objective: "Describe a past project using past simple correctly" },
  ...over,
});

// Starts a Written Assessment, has one exchange and ends it 10 minutes later.
export async function takeWrittenAssessment(app: TestApp, cookie: string, clock: ReturnType<typeof makeClock>) {
  const start = await app.request("/api/assessments", json({ mode: "written" }, cookie));
  const { id } = (await start.json()) as { id: string };
  const chat = await app.request(`/api/assessments/${id}/chat`, json({ message: userMessage("Hi, I'm ready.") }, cookie));
  await chat.text();
  clock.advance({ minutes: 10 });
  const end = await app.request(`/api/assessments/${id}/end`, json({}, cookie));
  return { id, end };
}

export const unitsReply = (n = 8) => ({
  units: Array.from({ length: n }, (_, i) => ({
    title: `Unit ${i + 1}`,
    objective: `Objective ${i + 1}`,
    skills: i % 2 ? ["grammar"] : ["vocabulary", "fluency"],
    endsWithRoleplay: i === n - 1,
  })),
});

// A Learner who has taken an Assessment and confirmed a Goal, so their first Unit is active.
// Set up with its own app, so the test's app only needs the models it scripts.
export async function learnerWithRoadmap(clock = makeClockFn()) {
  const setupApp = makeApp({
    now: clock,
    models: {
      step: mockChat("Hello!"),
      report: mockModel(reportReply()),
      roadmap: mockModel(unitsReply()),
      brief: mockModel("Asha is a backend engineer at a Pune fintech."),
    },
  });
  const learner = await signUp(setupApp);
  await takeWrittenAssessment(setupApp, learner.cookie, clock);
  const [goal] = (await (await setupApp.request("/api/goals", get(learner.cookie))).json()) as any[];
  await setupApp.request(`/api/goals/${goal.id}/confirm`, json({}, learner.cookie));
  const units = (await (await setupApp.request("/api/roadmap", get(learner.cookie))).json()) as any[];
  return { ...learner, units };
}

export const lessonPlan = (over: Record<string, unknown> = {}) => ({
  title: "Present simple for routines",
  objective: "Use present simple for daily routines",
  ...over,
});

export const fillGap = (sentence = "She ___ to work every day.", answer = "goes") => ({
  tool: "fillGap",
  input: { sentence, answer, choices: ["go", "goes", "went"] },
});

export const feedback = (verdict = "correct", corrected = "She goes to work every day.") => ({
  tool: "giveFeedback",
  input: { verdict, corrected, explanation: "Use -s with he, she and it in present simple." },
});

// Answers the Step waiting in the Lesson's last message, the way the web client returns a tool output.
export async function answerStep(app: TestApp, cookie: string, lessonId: string, output: unknown) {
  const lesson = (await (await app.request(`/api/lessons/${lessonId}`, get(cookie))).json()) as any;
  const last = lesson.messages.at(-1);
  const message = {
    ...last,
    parts: last.parts.map((p: any) =>
      p.type.startsWith("tool-") && p.state === "input-available" ? { ...p, state: "output-available", output } : p,
    ),
  };
  const res = await app.request(`/api/lessons/${lessonId}/chat`, json({ message }, cookie));
  if (res.ok) await res.text();
  return res;
}

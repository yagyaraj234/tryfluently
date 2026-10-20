import { schema } from "@impromptu/db";
import { eq } from "drizzle-orm";
import { testDb } from "./setup";
import { get, json, makeApp, makeClock, mockChat, mockModel, signUp, userMessage, type TestApp } from "./helpers";

const makeClockFn = makeClock;

export const reportReply = (over: Record<string, unknown> = {}) => ({
  overallLevel: "B1",
  skills: {
    grammar: { score: 42, evidence: ["I have went to Pune last year"] },
    vocabulary: { score: 55, evidence: ["we leverage synergies"] },
    fluency: null,
  },
  strengths: ["Clear structure", "Good range of work vocabulary", "Confident tone"],
  weaknesses: [
    {
      label: "Past simple vs present perfect",
      kind: "grammar",
      quote: "I have went to Pune last year",
      betterVersion: "I went to Pune last year",
    },
    { label: "Articles before job titles", kind: "grammar", quote: "I am engineer", betterVersion: "I am an engineer" },
    { label: "Overused 'very'", kind: "vocabulary", quote: "very very good", betterVersion: "excellent" },
  ],
  proposedGoals: [
    {
      statement: "Get ready for a senior backend role.",
      targetLevels: { fluency: "B2", grammar: "B2", vocabulary: "C1" },
    },
  ],
  firstUnit: { title: "Talking about past projects", objective: "Describe a past project using past simple correctly" },
  ...over,
});

// Starts a Written Assessment, has one exchange and ends it 10 minutes later.
export async function takeWrittenAssessment(app: TestApp, cookie: string, clock: ReturnType<typeof makeClock>) {
  const start = await app.request("/api/assessments", json({ mode: "written" }, cookie));
  const { id } = (await start.json()) as { id: string };
  const chat = await app.request(
    `/api/assessments/${id}/chat`,
    json({ message: userMessage("Hi, I'm ready.") }, cookie),
  );
  await chat.text();
  clock.advance({ minutes: 10 });
  const end = await app.request(`/api/assessments/${id}/end`, json({}, cookie));
  const learner = (await (await app.request("/api/me", get(cookie))).json()) as { id: string };
  await app.runJobs(learner.id);
  return { id, end };
}

export const unitsReply = (n = 8, name = "Unit") => ({
  units: Array.from({ length: n }, (_, i) => ({
    title: `${name} ${i + 1}`,
    objective: `${name} objective ${i + 1}`,
    skills: i % 2 ? ["grammar"] : ["vocabulary", "fluency"],
    endsWithRoleplay: i === n - 1,
    lessonOutline: [
      {
        title: i === 0 ? "Present simple for routines" : `${name} words ${i + 1}`,
        objective: "Use useful words in context",
        skill: "vocabulary",
        kind: "practice",
        estimatedMinutes: 6,
        pageCount: 5,
      },
      {
        title: `${name} clearer sentences ${i + 1}`,
        objective: "Make your meaning clear",
        skill: "grammar",
        kind: "practice",
        estimatedMinutes: 6,
        pageCount: 5,
      },
      {
        title: `${name} explain your ideas ${i + 1}`,
        objective: "Explain a real example confidently",
        skill: "fluency",
        kind: "practice",
        estimatedMinutes: 6,
        pageCount: 5,
      },
      ...(i === n - 1
        ? [
            {
              title: `${name} conversation ${i + 1}`,
              objective: "Use this Unit in a conversation",
              skill: "fluency",
              kind: "roleplay",
              estimatedMinutes: 6,
              pageCount: 5,
            },
          ]
        : []),
    ],
  })),
});

// A Learner who has taken an Assessment and confirmed a Goal, so their first Unit is active.
// Set up with its own app, so the test's app only needs the models it scripts.
export async function learnerWithRoadmap(
  clock = makeClockFn(),
  signUpFields: Record<string, unknown> = {},
  // Roleplay tests need a fixed Mock Interview, so the proposed Goal is confirmed as a Job Interview.
  confirmEdits: Record<string, unknown> = { kind: "job_interview" },
) {
  const setupApp = makeApp({
    now: clock,
    models: {
      step: Object.assign(mockChat("Hello!"), { doGenerate: mockModel(preparedContent()).doGenerate }),
      report: mockModel(reportReply()),
      roadmap: mockModel(unitsReply()),
      brief: mockModel("Asha is a backend engineer at a Pune fintech."),
    },
  });
  const learner = await signUp(setupApp, signUpFields);
  await takeWrittenAssessment(setupApp, learner.cookie, clock);
  const [goal] = (await (await setupApp.request("/api/goals", get(learner.cookie))).json()) as any[];
  await setupApp.request(`/api/goals/${goal.id}/confirm`, json(confirmEdits, learner.cookie));
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

// Answers the Step waiting in a Lesson's (or Assessment's) last message, the way the web client returns a tool output.
export async function answerStep(
  app: TestApp,
  cookie: string,
  id: string,
  output: unknown,
  base: "lessons" | "assessments" = "lessons",
) {
  const body = (await (await app.request(`/api/${base}/${id}`, get(cookie))).json()) as any;
  const last = (body.messages ?? body.transcript).at(-1);
  const message = {
    ...last,
    parts: last.parts.map((p: any) =>
      p.type.startsWith("tool-") && p.state === "input-available" ? { ...p, state: "output-available", output } : p,
    ),
  };
  const res = await app.request(`/api/${base}/${id}/chat`, json({ message }, cookie));
  if (res.ok) await res.text();
  return res;
}

export const preparedContent = () => ({
  material: [{ title: "Routines", body: "Use present simple for habits.", example: "I walk daily." }],
  questions: Array.from({ length: 3 }, () => ({
    type: "fillGap",
    input: { sentence: "She ___ daily.", answer: "walks", choices: ["walk", "walks"] },
  })),
});

// Seed a pre-outline Roadmap to exercise the retained legacy chat/recording player.
export async function learnerWithLegacyRoadmap(...args: Parameters<typeof learnerWithRoadmap>) {
  const learner = await learnerWithRoadmap(...args);
  await testDb.delete(schema.lesson).where(eq(schema.lesson.userId, learner.id));
  await testDb.update(schema.unit).set({ lessonOutline: [] }).where(eq(schema.unit.userId, learner.id));
  return learner;
}

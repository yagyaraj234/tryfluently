import { json, userMessage, type makeClock, type TestApp } from "./helpers";

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

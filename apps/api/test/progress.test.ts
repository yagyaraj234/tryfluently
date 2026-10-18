import { describe, expect, test } from "bun:test";
import { answerStep, feedback, fillGap, learnerWithRoadmap, lessonPlan } from "./fixtures";
import { get, json, makeApp, makeClock, mockModel, mockTurns, userMessage, type TestApp, type Turn } from "./helpers";

const end = { tool: "endLesson", input: {} };
const judgeReply = {
  skills: { fluency: null, grammar: { score: 50, evidence: [] }, vocabulary: null },
  objectiveProgress: 60,
  summary: "Practised routines.",
  focusItems: null,
};

// A Lesson finished after 3 answers, or one left after `answers` answers.
const finished: Turn[] = [[fillGap()], [feedback(), fillGap()], [feedback(), fillGap()], [feedback(), end]];
const halfDone = (answers: number): Turn[] => [[fillGap()], ...Array.from({ length: answers }, () => [feedback(), fillGap()])];

// An app that plays the given Lessons in order.
function appFor(lessons: Turn[][], clock: ReturnType<typeof makeClock>) {
  const step = mockTurns(...lessons.flat());
  step.doGenerate = mockModel(...lessons.map(() => lessonPlan())).doGenerate;
  const judge = mockModel(...lessons.map(() => judgeReply));
  return makeApp({ now: clock, models: { step, judge } });
}

async function playLesson(app: TestApp, cookie: string, turns: Turn[]) {
  const lesson = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;
  await (await app.request(`/api/lessons/${lesson.id}/chat`, json({ message: userMessage("Let's start") }, cookie))).text();
  for (let i = 1; i < turns.length; i++) await answerStep(app, cookie, lesson.id, { answer: "goes" });
}

const progressOf = async (app: TestApp, cookie: string) => (await (await app.request("/api/progress", get(cookie))).json()) as any;

describe("XP and Streak", () => {
  test("XP is 10 per answered Step plus 20 per completed Lesson; an Assessment earns nothing", async () => {
    const clock = makeClock();
    const app = appFor([finished, halfDone(1)], clock);
    const { cookie } = await learnerWithRoadmap(clock);
    expect(await progressOf(app, cookie)).toMatchObject({ xp: 0, streak: 0 });

    await playLesson(app, cookie, finished);
    await playLesson(app, cookie, halfDone(1));

    // 4 answered Steps × 10 + 1 completed Lesson × 20
    expect(await progressOf(app, cookie)).toMatchObject({ xp: 60, streak: 1 });
  });

  test("the Streak counts consecutive local days with a completed Lesson", async () => {
    const clock = makeClock("2026-10-15T09:00:00Z");
    const app = appFor([finished, finished, finished], clock);
    const { cookie } = await learnerWithRoadmap(clock, { timezone: "Asia/Kolkata" });

    await playLesson(app, cookie, finished);
    clock.advance({ days: 1 });
    await playLesson(app, cookie, finished);
    clock.advance({ days: 1 });
    await playLesson(app, cookie, finished);

    expect((await progressOf(app, cookie)).streak).toBe(3);
  });

  test("a Lesson at 23:30 local time counts for that local day, not the UTC one", async () => {
    const clock = makeClock("2026-10-15T03:00:00Z");
    const app = appFor([finished, finished], clock);
    const { cookie } = await learnerWithRoadmap(clock, { timezone: "America/New_York" });

    clock.set("2026-10-15T03:30:00Z"); // 14 Oct, 23:30 in New York
    await playLesson(app, cookie, finished);
    clock.set("2026-10-15T14:00:00Z"); // 15 Oct, 10:00 in New York, the same UTC day
    await playLesson(app, cookie, finished);

    expect((await progressOf(app, cookie)).streak).toBe(2);
  });

  test("a Streak still stands the next day until that day ends, and a missed day resets it", async () => {
    const clock = makeClock("2026-10-15T09:00:00Z");
    const app = appFor([finished, finished, finished], clock);
    const { cookie } = await learnerWithRoadmap(clock);

    await playLesson(app, cookie, finished); // 15 Oct
    clock.advance({ days: 1 });
    await playLesson(app, cookie, finished); // 16 Oct

    clock.set("2026-10-17T23:59:00Z"); // nothing yet today, but yesterday keeps it alive
    expect((await progressOf(app, cookie)).streak).toBe(2);

    clock.set("2026-10-18T00:00:00Z"); // 17 Oct was missed
    expect((await progressOf(app, cookie)).streak).toBe(0);

    await playLesson(app, cookie, finished);
    expect((await progressOf(app, cookie)).streak).toBe(1);
  });

  test("a Lesson left halfway doesn't count toward the Streak", async () => {
    const clock = makeClock("2026-10-15T09:00:00Z");
    const app = appFor([finished, halfDone(2)], clock);
    const { cookie } = await learnerWithRoadmap(clock);

    await playLesson(app, cookie, finished); // 15 Oct
    clock.advance({ days: 1 });
    await playLesson(app, cookie, halfDone(2)); // 16 Oct, not finished
    clock.advance({ days: 1 });

    expect(await progressOf(app, cookie)).toMatchObject({ streak: 0 });
  });
});

describe("This week", () => {
  test("the week runs Monday to Sunday in the Learner's timezone, marking the days with a completed Lesson", async () => {
    const clock = makeClock("2026-10-11T09:00:00Z");
    const app = appFor([finished, finished, finished], clock);
    const { cookie } = await learnerWithRoadmap(clock, { timezone: "Asia/Kolkata" });

    await playLesson(app, cookie, finished); // Sun 11 Oct: last week
    clock.set("2026-10-11T19:00:00Z"); // Mon 12 Oct, 00:30 in Kolkata, still Sunday in UTC
    await playLesson(app, cookie, finished);
    clock.set("2026-10-14T09:00:00Z"); // Wed 14 Oct
    await playLesson(app, cookie, finished);
    clock.set("2026-10-15T09:00:00Z"); // Thu 15 Oct

    expect((await progressOf(app, cookie)).week).toEqual([
      { day: "2026-10-12", practised: true, today: false },
      { day: "2026-10-13", practised: false, today: false },
      { day: "2026-10-14", practised: true, today: false },
      { day: "2026-10-15", practised: false, today: true },
      { day: "2026-10-16", practised: false, today: false },
      { day: "2026-10-17", practised: false, today: false },
      { day: "2026-10-18", practised: false, today: false },
    ]);
  });
});

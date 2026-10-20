import { expect, test } from "bun:test";
import { get, json, makeApp, makeClock, mockChat, mockModel, signUp } from "./helpers";
import { legacyOutlines, reportReply, takeWrittenAssessment, unitsReply } from "./fixtures";

const content = {
  material: [{ title: "Daily routines", body: "Use present simple for habits.", example: "I walk to work." }],
  questions: Array.from({ length: 3 }, () => ({
    type: "fillGap",
    input: { sentence: "She ___ daily.", answer: "walks", choices: ["walk", "walks"] },
  })),
};

async function preparedLearner() {
  const clock = makeClock();
  const app = makeApp({
    now: clock,
    models: {
      step: mockChat("Hello"),
      report: mockModel(reportReply()),
      roadmap: mockModel(unitsReply()),
      brief: mockModel("Brief"),
    },
  });
  const learner = await signUp(app);
  await takeWrittenAssessment(app, learner.cookie, clock);
  const [goal] = (await (await app.request("/api/goals", get(learner.cookie))).json()) as any[];
  return { ...learner, clock, goal };
}

test("confirming Goals prepares no Lesson; the first one has fixed material and private question keys", async () => {
  const { id: learnerId, cookie, clock, goal } = await preparedLearner();
  const step = mockModel(content);
  const app = makeApp({ now: clock, models: { roadmap: mockModel(unitsReply()), step } });
  expect((await app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie))).status).toBe(200);
  await legacyOutlines(learnerId);
  expect(((await (await app.request("/api/roadmap", get(cookie))).json()) as any[]).flatMap((u) => u.lessons)).toEqual(
    [],
  );
  expect(step.doGenerateCalls).toHaveLength(0);
  await app.request("/api/lessons/next", json({}, cookie));
  const units = (await (await app.request("/api/roadmap", get(cookie))).json()) as any[];
  expect(units[0].lessons).toHaveLength(1);
  expect(units.slice(1).every((u) => !u.lessons.length)).toBe(true);
  const first = (await (await app.request(`/api/lessons/${units[0].lessons[0].id}`, get(cookie))).json()) as any;
  expect(first).toMatchObject({ preparation: "ready", phase: "learning", material: content.material });
  expect(JSON.stringify(first)).not.toContain('"answer":"walks"');
  expect(first.questions).toHaveLength(3);
});

const judgment = {
  skills: {
    fluency: { score: 90, evidence: ["Unobserved"] },
    grammar: { score: 30, evidence: ["She walk daily"] },
    vocabulary: null,
  },
  objectiveProgress: 30,
  summary: "Needs subject–verb agreement practice.",
  focusItems: null,
  feedback: Array.from({ length: 3 }, (_, position) => ({
    position,
    verdict: "incorrect",
    corrected: "walks",
    explanation: "Use -s with she.",
  })),
};

test("a completed low-score assessment saves its report and prepares the next Lesson without changing outlines", async () => {
  const { id: learnerId, cookie, clock, goal } = await preparedLearner();
  const app = makeApp({
    now: clock,
    models: { roadmap: mockModel(unitsReply()), step: mockModel(content, content), judge: mockModel(judgment) },
  });
  await app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie));
  await legacyOutlines(learnerId);
  await app.request("/api/lessons/next", json({}, cookie));
  const before = (await (await app.request("/api/roadmap", get(cookie))).json()) as any[];
  const id = before[0].lessons[0].id;
  expect((await app.request(`/api/lessons/${id}/assessment`, json({}, cookie))).status).toBe(200);
  let body = (await (await app.request(`/api/lessons/${id}`, get(cookie))).json()) as any;
  for (const question of body.questions) {
    expect(
      (await app.request(`/api/lessons/${id}/answers`, json({ stepId: question.id, answer: "walk" }, cookie))).status,
    ).toBe(200);
  }
  expect((await app.request(`/api/lessons/${id}/finish`, json({}, cookie))).status).toBe(200);
  body = (await (await app.request(`/api/lessons/${id}`, get(cookie))).json()) as any;
  expect(body).toMatchObject({ status: "completed", report: { summary: judgment.summary, objectiveProgress: 30 } });
  expect(body.steps[0].feedback.verdict).toBe("incorrect");
  expect(body.report.skills.fluency).toBeNull();
  const after = (await (await app.request("/api/roadmap", get(cookie))).json()) as any[];
  expect(after.map((u) => u.lessonOutline)).toEqual(before.map((u) => u.lessonOutline));
  // Finishing a Lesson no longer prepares the next one.
  expect(after[0].lessons).toHaveLength(1);
  const history = (await (await app.request("/api/reports", get(cookie))).json()) as any[];
  expect(history.some((r) => r.id === id && r.kind === "lesson")).toBe(true);
  const progress = await (await app.request("/api/progress", get(cookie))).json();
  expect(progress).toMatchObject({
    learning: { completedLessons: 1, plannedLessons: 25, completedUnits: 0, totalUnits: 8, lessonsThisWeek: 1 },
  });
});

test("failed preparation can be retried concurrently without duplicate Lessons or leaked content", async () => {
  const { id: learnerId, cookie, clock, goal } = await preparedLearner();
  const failed = makeApp({
    now: clock,
    models: { roadmap: mockModel(unitsReply()), step: mockModel({ invalid: true }) },
  });
  await failed.request(`/api/goals/${goal.id}/confirm`, json({}, cookie));
  await legacyOutlines(learnerId);
  await failed.request("/api/lessons/next", json({}, cookie));
  const units = (await (await failed.request("/api/roadmap", get(cookie))).json()) as any[];
  expect(units[0].lessons[0].preparation).toBe("failed");
  const retry = makeApp({ now: clock, models: { step: mockModel(content) } });
  await Promise.all([
    retry.request("/api/lessons/next", json({}, cookie)),
    retry.request("/api/lessons/next", json({}, cookie)),
  ]);
  const after = (await (await retry.request("/api/roadmap", get(cookie))).json()) as any[];
  expect(after[0].lessons).toHaveLength(1);
  expect(after[0].lessons[0].preparation).toBe("ready");
  const other = await signUp(retry);
  const id = after[0].lessons[0].id;
  for (const endpoint of ["assessment", "answers", "finish"]) {
    expect(
      (await retry.request(`/api/lessons/${id}/${endpoint}`, json({ stepId: "x", answer: "walk" }, other.cookie)))
        .status,
    ).toBe(404);
  }
  const loaded = (await (await retry.request(`/api/lessons/${id}`, get(cookie))).json()) as any;
  expect(JSON.stringify(loaded)).not.toContain('"answer":"walks"');
  expect((await retry.request(`/api/lessons/${id}/finish`, json({}, cookie))).status).toBe(409);
});

test("every outlined Lesson completes before the next Unit opens, carrying performance across Units", async () => {
  const { id: learnerId, cookie, clock, goal } = await preparedLearner();
  const model = mockModel(content, content, content, content);
  const app = makeApp({
    now: clock,
    models: { roadmap: mockModel(unitsReply()), step: model, judge: mockModel(judgment, judgment, judgment) },
  });
  await app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie));
  await legacyOutlines(learnerId);
  for (let n = 0; n < 3; n++) {
    const lesson = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;
    await app.request(`/api/lessons/${lesson.id}/assessment`, json({}, cookie));
    for (const q of lesson.questions)
      await app.request(`/api/lessons/${lesson.id}/answers`, json({ stepId: q.id, answer: "walk" }, cookie));
    expect((await app.request(`/api/lessons/${lesson.id}/finish`, json({}, cookie))).status).toBe(200);
    const units = (await (await app.request("/api/roadmap", get(cookie))).json()) as any[];
    expect(units[0].status).toBe(n === 2 ? "mastered" : "active");
    expect(units[1].status).toBe(n === 2 ? "active" : "planned");
  }
  expect(
    ((await (await app.request("/api/roadmap", get(cookie))).json()) as any[]).flatMap((u) => u.lessons),
  ).toHaveLength(3);
  const opened = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;
  expect(opened.preparation).toBe("ready");
  // External generation boundary: the next Unit must receive the latest learning evidence.
  expect(JSON.stringify(model.doGenerateCalls[3]!.prompt)).toContain(judgment.summary);
});

test("failed judging preserves answers, retry completes once, and finishing does not prepare another Lesson", async () => {
  const { id: learnerId, cookie, clock, goal } = await preparedLearner();
  const app = makeApp({
    now: clock,
    models: { roadmap: mockModel(unitsReply()), step: mockModel(content, {}), judge: mockModel({}, judgment) },
  });
  await app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie));
  await legacyOutlines(learnerId);
  const l = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;
  await app.request(`/api/lessons/${l.id}/assessment`, json({}, cookie));
  for (const q of l.questions)
    await app.request(`/api/lessons/${l.id}/answers`, json({ stepId: q.id, answer: "walk" }, cookie));
  expect((await app.request(`/api/lessons/${l.id}/finish`, json({}, cookie))).status).toBe(502);
  const saved = (await (await app.request(`/api/lessons/${l.id}`, get(cookie))).json()) as any;
  expect(saved.status).toBe("in_progress");
  expect(saved.questions.every((q: any) => q.answeredAt)).toBe(true);
  expect((await app.request(`/api/lessons/${l.id}/finish`, json({}, cookie))).status).toBe(200);
  expect((await app.request(`/api/lessons/${l.id}/finish`, json({}, cookie))).status).toBe(200);
  const units = (await (await app.request("/api/roadmap", get(cookie))).json()) as any[];
  expect(units[0].lessons).toHaveLength(1);
  expect(((await (await app.request(`/api/lessons/${l.id}`, get(cookie))).json()) as any).report.summary).toBe(
    judgment.summary,
  );
  const history = (await (await app.request("/api/skill-profile/history", get(cookie))).json()) as any[];
  expect(history.filter((r) => r.sourceId === l.id)).toHaveLength(1);
});

test("concurrent Goal confirmations build one Roadmap and no Lesson", async () => {
  const { cookie, clock, goal } = await preparedLearner();
  const app = makeApp({
    now: clock,
    models: { roadmap: mockModel(unitsReply(), unitsReply()), step: mockModel(content, content) },
  });
  await Promise.all([
    app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie)),
    app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie)),
  ]);
  const units = (await (await app.request("/api/roadmap", get(cookie))).json()) as any[];
  expect(units).toHaveLength(8);
  expect(units.flatMap((u) => u.lessons)).toHaveLength(0);
});

test("outlined Roleplay waits for all practice Lessons and its saved Debrief appears in both histories", async () => {
  const { id: learnerId, cookie, clock, goal } = await preparedLearner();
  const roadmap = unitsReply();
  roadmap.units[0]!.endsWithRoleplay = true;
  roadmap.units[0]!.lessonOutline.push({
    title: "Routines conversation",
    objective: "Discuss routines",
    skill: "fluency",
    kind: "roleplay",
    estimatedMinutes: 6,
    pageCount: 5,
  });
  const step = Object.assign(mockChat("Tell me about your work."), {
    doGenerate: mockModel(content, content, content, content).doGenerate,
  });
  const debrief = {
    overallImpression: "Clear answers",
    questions: [
      { question: "Your work?", quote: "I lead a team", strongerPhrasing: "I lead a small team", languageIssues: [] },
    ],
    skills: judgment.skills,
    phrasesToLearn: ["lead a team", "work on", "walk through"],
    objectiveProgress: 30,
    summary: "Practised routines in conversation.",
  };
  const app = makeApp({
    now: clock,
    models: { roadmap: mockModel(roadmap), step, judge: mockModel(judgment, judgment, judgment, debrief) },
  });
  await app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie));
  await legacyOutlines(learnerId);
  for (let n = 0; n < 3; n++) {
    const l = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;
    expect(l.kind).toBe("practice");
    await app.request(`/api/lessons/${l.id}/assessment`, json({}, cookie));
    for (const q of l.questions)
      await app.request(`/api/lessons/${l.id}/answers`, json({ stepId: q.id, answer: "walk" }, cookie));
    await app.request(`/api/lessons/${l.id}/finish`, json({}, cookie));
  }
  const rp = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;
  expect(rp).toMatchObject({ kind: "roleplay", title: "Routines conversation", position: 3 });
  await (
    await app.request(
      `/api/roleplays/${rp.id}/chat`,
      json({ message: { id: "answer", role: "user", parts: [{ type: "text", text: "I lead a team" }] } }, cookie),
    )
  ).text();
  expect((await app.request(`/api/roleplays/${rp.id}/end`, json({}, cookie))).status).toBe(200);
  const saved = (await (await app.request(`/api/lessons/${rp.id}`, get(cookie))).json()) as any;
  expect(saved.debrief.overallImpression).toBe("Clear answers");
  expect(((await (await app.request("/api/roleplays", get(cookie))).json()) as any[]).some((r) => r.id === rp.id)).toBe(
    true,
  );
  expect(
    ((await (await app.request("/api/reports", get(cookie))).json()) as any[]).some(
      (r) => r.id === rp.id && r.kind === "roleplay",
    ),
  ).toBe(true);
  expect(((await (await app.request("/api/roadmap", get(cookie))).json()) as any[])[0].status).toBe("mastered");
});

test("retrying the final practice Lesson cannot unlock its Roleplay early", async () => {
  const { id: learnerId, cookie, clock, goal } = await preparedLearner();
  const roadmap = unitsReply();
  roadmap.units[0]!.endsWithRoleplay = true;
  roadmap.units[0]!.lessonOutline.push({
    title: "Final conversation",
    objective: "Discuss routines",
    skill: "fluency",
    kind: "roleplay",
    estimatedMinutes: 6,
    pageCount: 5,
  });
  const app = makeApp({
    now: clock,
    models: {
      roadmap: mockModel(roadmap),
      step: mockModel(content, content, {}),
      judge: mockModel(judgment, judgment),
    },
  });
  await app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie));
  await legacyOutlines(learnerId);
  for (let n = 0; n < 2; n++) {
    const l = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;
    await app.request(`/api/lessons/${l.id}/assessment`, json({}, cookie));
    for (const q of l.questions)
      await app.request(`/api/lessons/${l.id}/answers`, json({ stepId: q.id, answer: "walk" }, cookie));
    await app.request(`/api/lessons/${l.id}/finish`, json({}, cookie));
  }
  const retry = makeApp({ now: clock, models: { step: mockModel(content) } });
  const l = await (await retry.request("/api/lessons/next", json({}, cookie))).json();
  expect(l).toMatchObject({ kind: "practice", position: 2, preparation: "ready" });
});

test("malformed question choices fail preparation instead of publishing an unanswerable assessment", async () => {
  const { id: learnerId, cookie, clock, goal } = await preparedLearner();
  const invalid = {
    ...content,
    questions: content.questions.map((q) => ({ ...q, input: { ...q.input, choices: ["run", "runs"] } })),
  };
  const app = makeApp({ now: clock, models: { roadmap: mockModel(unitsReply()), step: mockModel(invalid) } });
  await app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie));
  await legacyOutlines(learnerId);
  await app.request("/api/lessons/next", json({}, cookie));
  const units = (await (await app.request("/api/roadmap", get(cookie))).json()) as any[];
  expect(units[0].lessons[0].preparation).toBe("failed");
});

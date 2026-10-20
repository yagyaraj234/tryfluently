import { expect, test } from "bun:test";
import { schema } from "@impromptu/db";
import { eq } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { learnerWithRoadmap } from "./fixtures";
import { get, json, makeApp } from "./helpers";
import { testDb } from "./setup";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};
const blocks = ["reading", "vocabCard", "fillGap", "multipleChoice", "speakPrompt"];
const allBlocks = [
  "reading",
  "vocabCard",
  "fillGap",
  "multipleChoice",
  "matchPairs",
  "reorder",
  "rewrite",
  "speakPrompt",
];

// Plays the planner and the Page writers. `page(n, attempt)` can return a bad Page to force a retry.
const questionFor: Record<string, object> = {
  vocabCard: {
    block: "vocabCard",
    term: "commute",
    answer: "daily trip to work",
    explanation: "A commute is the trip you make to work.",
  },
  fillGap: {
    block: "fillGap",
    prompt: "She ___ to work.",
    answer: "goes",
    explanation: "Third person singular takes -es.",
  },
  multipleChoice: {
    block: "multipleChoice",
    prompt: "Pick one.",
    options: ["go", "goes"],
    answerIndex: 1,
    explanation: "He/she/it takes -es.",
  },
  matchPairs: {
    block: "matchPairs",
    prompt: "Match.",
    pairs: [
      { left: "I", right: "go" },
      { left: "she", right: "goes" },
    ],
    explanation: "Verb agrees.",
  },
  reorder: {
    block: "reorder",
    prompt: "Order.",
    answer: ["She", "goes", "home"],
    explanation: "Subject, verb, place.",
  },
  rewrite: { block: "rewrite", prompt: "Rewrite: I goes.", expectedAnswer: "I go.", rubric: "Uses go for I." },
  speakPrompt: {
    block: "speakPrompt",
    prompt: "Say your routine.",
    expectedAnswer: "I go to work at nine.",
    rubric: "Present simple, one routine.",
  },
};
// `questions(planBlocks, attempt)` can return a bad reply to force a retry.
function fakeLessonModel(
  page: (n: number, attempt: number) => object = good,
  pageBlocks: string[] = blocks,
  questions: (pages: any[], attempt: number) => object = (pages) => ({
    questions: pages
      .filter((p) => p.block !== "reading")
      .map((p) => ({ page: p.page, question: questionFor[p.block] })),
  }),
) {
  let questionAttempts = 0;
  const attempts = new Map<number, number>();
  const calls = { planner: 0, writers: [] as any[], questions: [] as any[] };
  const model = new MockLanguageModelV4({
    doGenerate: async (options: any) => {
      const system = JSON.stringify(options.prompt);
      let reply: object;
      if (system.includes("Plan one short English Lesson")) {
        calls.planner++;
        reply = { pages: pageBlocks.map((block, i) => ({ idea: `Idea ${i + 1}`, block })) };
      } else if (system.includes("Write the questions")) {
        const body = JSON.parse(options.prompt.at(-1).content[0].text);
        calls.questions.push(body);
        reply = questions(body.pages, ++questionAttempts);
      } else {
        const slice = JSON.parse(options.prompt.at(-1).content[0].text);
        calls.writers.push(slice);
        const n = slice.page;
        attempts.set(n, (attempts.get(n) ?? 0) + 1);
        reply = page(n, attempts.get(n)!);
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(reply) }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage,
        warnings: [],
        response: { id: `resp-${crypto.randomUUID()}` },
      };
    },
  });
  return { model, calls, attempts, questionAttempts: () => questionAttempts };
}

const good = (n: number) => ({
  title: `Page ${n}`,
  body: `Short reading ${n}.`,
  example: null,
  answerKey: [3, 4, 5, 6].includes(n) ? "goes" : null,
});

async function learner() {
  const l = await learnerWithRoadmap();
  // The Roadmap setup prepares an old-format first Lesson; clear it so Start is the first thing that happens.
  await testDb.delete(schema.lesson).where(eq(schema.lesson.userId, l.id));
  return l;
}
const start = (app: any, cookie: string, p = 0) => app.request(`/api/lessons/${p}/start`, json({}, cookie));
const pages = async (app: any, cookie: string, id: string) =>
  (await (await app.request(`/api/lessons/${id}/pages`, get(cookie))).json()) as any;

test("starting a Lesson plans it, writes every Page in parallel, and the status route never leaks answer keys", async () => {
  const { cookie, id: userId } = await learner();
  const fake = fakeLessonModel();
  const app = makeApp({ models: { step: fake.model } });
  const res = await start(app, cookie);
  expect(res.status).toBe(201);
  const started = (await res.json()) as any;
  expect(started.preparation).toBe("preparing");
  expect(started.pages.map((p: any) => p.status)).toEqual(Array(5).fill("pending"));
  const [row] = await testDb.select().from(schema.lesson).where(eq(schema.lesson.id, started.id));
  expect(row).toMatchObject({ contentVersion: 2, preparation: "preparing" });

  await app.runJobs(userId);
  const done = await pages(app, cookie, started.id);
  expect(done.preparation).toBe("ready");
  expect(done.pages.map((p: any) => [p.status, p.block])).toEqual(blocks.map((b) => ["ready", b]));
  expect(done.pages[0].body).toBe("Short reading 1.");
  // (A question may show "goes" as one of several options; the keys and explanations never appear.)
  expect(JSON.stringify(done)).not.toContain("answerKey");
  expect(JSON.stringify(done)).not.toContain("Third person");
  const whole = await (await app.request(`/api/lessons/${started.id}`, get(cookie))).json();
  expect(JSON.stringify(whole)).not.toContain("answerKey");
  expect(JSON.stringify(whole)).not.toContain("Third person");
  // The key is kept for the question step.
  const [saved] = await testDb.select().from(schema.lesson).where(eq(schema.lesson.id, started.id));
  expect(JSON.stringify(saved!.material)).toContain("goes");
  // Question step ran once, after the Pages, and saw the whole plan.
  expect(fake.calls.questions).toHaveLength(1);
  expect(fake.calls.questions[0].pages).toHaveLength(5);
  expect(fake.calls.planner).toBe(1);
  // Each writer got only its own slice.
  expect(fake.calls.writers).toHaveLength(5);
  expect(fake.calls.writers.map((w) => w.idea).sort()).toEqual(["Idea 1", "Idea 2", "Idea 3", "Idea 4", "Idea 5"]);
});

test("a Page that fails its checks retries alone and then lands", async () => {
  const { cookie, id: userId } = await learner();
  const leaky = { ...good(3), body: "She goes to work." };
  const fake = fakeLessonModel((n, attempt) => (n === 3 && attempt < 3 ? leaky : good(n)));
  const app = makeApp({ models: { step: fake.model } });
  const { id } = (await (await start(app, cookie)).json()) as any;
  await app.runJobs(userId);
  expect((await pages(app, cookie, id)).preparation).toBe("ready");
  expect(fake.attempts.get(3)).toBe(3);
  expect(fake.attempts.get(1)).toBe(1);
});

test("a Page that keeps failing fails the Lesson, and Retry runs it again", async () => {
  const { cookie, id: userId } = await learner();
  const tooLong = { ...good(2), body: "word ".repeat(151) };
  let broken = true;
  const fake = fakeLessonModel((n) => (n === 2 && broken ? tooLong : good(n)));
  const app = makeApp({ models: { step: fake.model } });
  const { id } = (await (await start(app, cookie)).json()) as any;
  await app.runJobs(userId);
  const failed = await pages(app, cookie, id);
  expect(failed.preparation).toBe("failed");
  expect(failed.pages.map((p: any) => p.status)).toEqual(["ready", "failed", "ready", "ready", "ready"]);
  expect(fake.attempts.get(2)).toBe(3);

  broken = false;
  expect((await app.request(`/api/lessons/${id}/retry`, json({}, cookie))).status).toBe(202);
  await app.runJobs(userId);
  expect((await pages(app, cookie, id)).preparation).toBe("ready");
  // Only a failed Lesson can be retried.
  expect((await app.request(`/api/lessons/${id}/retry`, json({}, cookie))).status).toBe(409);
});

test("starting the same Lesson twice starts one run", async () => {
  const { cookie, id: userId } = await learner();
  const fake = fakeLessonModel();
  const app = makeApp({ models: { step: fake.model } });
  const [a, b] = await Promise.all([start(app, cookie), start(app, cookie)]);
  expect([a.status, b.status].sort()).toEqual([200, 201]);
  const ids = new Set([((await a.json()) as any).id, ((await b.json()) as any).id]);
  expect(ids.size).toBe(1);
  await app.runJobs(userId);
  await app.runJobs(userId);
  expect(fake.calls.planner).toBe(1);
  const jobs = await testDb.select().from(schema.assessmentJob).where(eq(schema.assessmentJob.userId, userId));
  expect(jobs.filter((j) => j.kind === "lesson")).toHaveLength(1);
});

test("only the next outlined practice Lesson can be started", async () => {
  const { cookie } = await learner();
  const app = makeApp({ models: { step: fakeLessonModel().model } });
  expect((await start(app, cookie, 2)).status).toBe(409);
  expect((await start(app, cookie, 99)).status).toBe(409);
});

test("every Block type's question is saved in full and nothing but the question reaches the Learner", async () => {
  const { cookie, id: userId } = await learner();
  const fake = fakeLessonModel(good, allBlocks);
  const app = makeApp({ models: { step: fake.model } });
  // Eight Pages: give the outline room by editing the stored plan length through the Lesson row.
  const res = await start(app, cookie);
  const { id } = (await res.json()) as any;
  await testDb
    .update(schema.lesson)
    .set({
      pageStatus: allBlocks.map(() => ({ page: "pending" as const, question: "pending" as const })),
      material: allBlocks.map(() => ({ title: "", body: "", example: null })),
    })
    .where(eq(schema.lesson.id, id));
  await app.runJobs(userId);
  const [saved] = await testDb.select().from(schema.lesson).where(eq(schema.lesson.id, id));
  const material = saved!.material as any[];
  expect(material.map((m) => m.question?.block)).toEqual([undefined, ...allBlocks.slice(1)]);
  for (const block of allBlocks.slice(1))
    expect(material[allBlocks.indexOf(block)].question).toEqual(questionFor[block]);
  expect(saved!.pageStatus!.every((s) => s.question === "ready")).toBe(true);

  const view = await pages(app, cookie, id);
  expect(view.pages.map((p: any) => p.question)).toEqual(Array(8).fill("ready"));
  expect(view.pages[0].questionData).toBeUndefined();
  expect(view.pages[1].questionData).toEqual({ block: "vocabCard", term: "commute" });
  expect(view.pages[4].questionData).toEqual({
    block: "matchPairs",
    prompt: "Match.",
    left: ["I", "she"],
    right: ["go", "goes"],
  });
  expect(view.pages[5].questionData.items).not.toEqual(["She", "goes", "home"]);
  expect([...view.pages[5].questionData.items].sort()).toEqual(["She", "goes", "home"]);
  const whole = JSON.stringify([view, await (await app.request(`/api/lessons/${id}`, get(cookie))).json()]);
  for (const secret of [
    "daily trip",
    "Third person",
    "answerIndex",
    "expectedAnswer",
    "rubric",
    "explanation",
    "I go.",
    "nine",
    "Subject, verb",
  ])
    expect(whole).not.toContain(secret);
  expect(whole).not.toContain('"answer"');
});

test("Page 1 is readable before the question step runs, and questions show as pending until then", async () => {
  const { cookie, id: userId } = await learner();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const fake = fakeLessonModel(good, blocks, (pages) => ({
    questions: pages
      .filter((p) => p.block !== "reading")
      .map((p) => ({ page: p.page, question: questionFor[p.block] })),
  }));
  const inner = fake.model.doGenerate as any;
  fake.model.doGenerate = async (o: any) => {
    if (JSON.stringify(o.prompt).includes("Write the questions")) await gate;
    return inner(o);
  };
  const app = makeApp({ models: { step: fake.model } });
  const { id } = (await (await start(app, cookie)).json()) as any;
  const run = app.runJobs(userId);
  let view: any;
  for (let i = 0; i < 100; i++) {
    view = await pages(app, cookie, id);
    if (view.pages.every((p: any) => p.status === "ready")) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(view.pages[0].body).toBe("Short reading 1.");
  expect(view.pages.map((p: any) => p.question)).toEqual(Array(5).fill("pending"));
  expect(view.pages.some((p: any) => p.questionData)).toBe(false);
  release();
  await run;
  expect((await pages(app, cookie, id)).pages.map((p: any) => p.question)).toEqual(Array(5).fill("ready"));
});

test("a bad question reply retries alone, without rewriting any Page", async () => {
  const { cookie, id: userId } = await learner();
  const ok = (pages: any[]) => ({
    questions: pages
      .filter((p) => p.block !== "reading")
      .map((p) => ({ page: p.page, question: questionFor[p.block] })),
  });
  const fake = fakeLessonModel(good, blocks, (pages, attempt) =>
    attempt < 3
      ? { questions: [{ page: 2, question: { ...(questionFor.fillGap as any), prompt: "No gap here." } }] }
      : ok(pages),
  );
  const app = makeApp({ models: { step: fake.model } });
  const { id } = (await (await start(app, cookie)).json()) as any;
  await app.runJobs(userId);
  expect(fake.questionAttempts()).toBe(3);
  expect(fake.calls.writers).toHaveLength(5);
  expect((await pages(app, cookie, id)).pages.map((p: any) => p.question)).toEqual(Array(5).fill("ready"));
});

test("a question step that keeps failing fails the Lesson, and Retry runs it again", async () => {
  const { cookie, id: userId } = await learner();
  let broken = true;
  const fake = fakeLessonModel(good, blocks, (pages) =>
    broken
      ? { questions: [] }
      : {
          questions: pages
            .filter((p) => p.block !== "reading")
            .map((p) => ({ page: p.page, question: questionFor[p.block] })),
        },
  );
  const app = makeApp({ models: { step: fake.model } });
  const { id } = (await (await start(app, cookie)).json()) as any;
  await app.runJobs(userId);
  expect(fake.questionAttempts()).toBe(3);
  const failed = await pages(app, cookie, id);
  expect(failed.preparation).toBe("failed");
  expect(failed.pages.map((p: any) => [p.status, p.question])).toEqual([
    ["ready", "ready"],
    ["ready", "failed"],
    ["ready", "failed"],
    ["ready", "failed"],
    ["ready", "failed"],
  ]);
  broken = false;
  expect((await app.request(`/api/lessons/${id}/retry`, json({}, cookie))).status).toBe(202);
  await app.runJobs(userId);
  expect((await pages(app, cookie, id)).pages.map((p: any) => p.question)).toEqual(Array(5).fill("ready"));
});

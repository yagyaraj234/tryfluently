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

// Plays the planner and the Page writers. `page(n, attempt)` can return a bad Page to force a retry.
function fakeLessonModel(page: (n: number, attempt: number) => object = good) {
  const attempts = new Map<number, number>();
  const calls = { planner: 0, writers: [] as any[] };
  const model = new MockLanguageModelV4({
    doGenerate: async (options: any) => {
      const system = JSON.stringify(options.prompt);
      let reply: object;
      if (system.includes("Plan one short English Lesson")) {
        calls.planner++;
        reply = { pages: blocks.map((block, i) => ({ idea: `Idea ${i + 1}`, block })) };
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
  return { model, calls, attempts };
}

const good = (n: number) => ({
  title: `Page ${n}`,
  body: `Short reading ${n}.`,
  example: null,
  answerKey: n === 3 || n === 4 ? "goes" : null,
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
  expect(JSON.stringify(done)).not.toContain("goes");
  const whole = await (await app.request(`/api/lessons/${started.id}`, get(cookie))).json();
  expect(JSON.stringify(whole)).not.toContain("goes");
  // The key is kept for the question step.
  const [saved] = await testDb.select().from(schema.lesson).where(eq(schema.lesson.id, started.id));
  expect(JSON.stringify(saved!.material)).toContain("goes");
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

import { expect, test } from "bun:test";
import { schema } from "@impromptu/db";
import { eq, inArray } from "drizzle-orm";
import { learnerWithRoadmap, preparedContent, lessonPlan, unitsReply } from "./fixtures";
import { get, json, makeApp, mockModel } from "./helpers";
import { testDb } from "./setup";

test("new Roadmaps persist several distinct Lesson outlines before practice is started", async () => {
  const { units } = await learnerWithRoadmap();
  for (const unit of units) {
    expect(unit.lessonOutline.filter((l: any) => l.kind === "practice")).toHaveLength(3);
    expect(new Set(unit.lessonOutline.map((l: any) => l.title)).size).toBe(unit.lessonOutline.length);
    expect(unit.lessons).toHaveLength(unit.position === 0 ? 1 : 0);
  }
});

test("starting a Lesson uses its outlined title while generating adaptive content", async () => {
  const { cookie, units } = await learnerWithRoadmap();
  const model = mockModel(preparedContent());
  const app = makeApp({ models: { step: model } });
  const response = await app.request("/api/lessons/next", json({}, cookie));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ title: units[0].lessonOutline[0].title, status: "in_progress" });
  expect(
    ((await (await app.request(`/api/lessons/${units[0].lessons[0].id}`, get(cookie))).json()) as any).material,
  ).toHaveLength(1);
});

test("existing Roadmaps get missing future outlines once without replacing an in-progress Lesson", async () => {
  const { cookie, units } = await learnerWithRoadmap();
  const before = makeApp({ models: { step: mockModel(lessonPlan()) } });
  const active = (await (await before.request("/api/lessons/next", json({}, cookie))).json()) as any;
  const ids = units.slice(0, 2).map((u: any) => u.id);
  await testDb.update(schema.unit).set({ lessonOutline: [] }).where(inArray(schema.unit.id, ids));
  const sample = unitsReply().units[0]!.lessonOutline;
  const model = mockModel({ units: ids.map((id: string) => ({ id, lessonOutline: sample })) });
  const app = makeApp({ models: { roadmap: model } });
  expect((await app.request("/api/roadmap/outline", json({}, cookie))).status).toBe(200);
  expect((await app.request("/api/roadmap/outline", json({}, cookie))).status).toBe(200);
  expect(model.doGenerateCalls).toHaveLength(1);
  const after = (await (await app.request("/api/roadmap", get(cookie))).json()) as any[];
  expect(after[0].lessons[0]).toMatchObject({ id: active.id, status: "in_progress", title: active.title });
  expect(after[0].lessonOutline[0].position).toBe(1);
  expect(after[1].lessonOutline[0].position).toBe(0);
});

test("an outline for a different Unit is rejected without writing any plan", async () => {
  const { cookie, units } = await learnerWithRoadmap();
  await testDb.update(schema.unit).set({ lessonOutline: [] }).where(eq(schema.unit.id, units[0].id));
  const app = makeApp({
    models: {
      roadmap: mockModel({ units: [{ id: "someone-else", lessonOutline: unitsReply().units[0]!.lessonOutline }] }),
    },
  });
  expect((await app.request("/api/roadmap/outline", json({}, cookie))).status).toBe(502);
  const [unchanged] = await testDb.select().from(schema.unit).where(eq(schema.unit.id, units[0].id));
  expect(unchanged!.lessonOutline).toEqual([]);
});

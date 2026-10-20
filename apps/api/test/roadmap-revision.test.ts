import { expect, test } from "bun:test";
import { learnerWithRoadmap, preparedContent, reportReply, takeWrittenAssessment } from "./fixtures";
import { get, json, makeApp, makeClock, mockChat, mockModel } from "./helpers";

const roadmapOf = async (app: ReturnType<typeof makeApp>, cookie: string) =>
  (await (await app.request("/api/roadmap", get(cookie))).json()) as any[];

test("Assessment retakes preserve Unit and Lesson outlines", async () => {
  const clock = makeClock();
  const { cookie } = await learnerWithRoadmap(clock);
  const app = makeApp({ now: clock, models: { step: mockChat("Hello again"), report: mockModel(reportReply()) } });
  const before = await roadmapOf(app, cookie);
  clock.advance({ days: 7 });
  expect((await takeWrittenAssessment(app, cookie, clock)).end.status).toBe(200);
  expect(
    (await roadmapOf(app, cookie)).map(({ id, title, objective, lessonOutline }) => ({
      id,
      title,
      objective,
      lessonOutline,
    })),
  ).toEqual(before.map(({ id, title, objective, lessonOutline }) => ({ id, title, objective, lessonOutline })));
});

test("skipping a Unit preserves outlines and abandons its open Lesson", async () => {
  const { cookie, units } = await learnerWithRoadmap();
  const app = makeApp({ models: { step: mockModel(preparedContent()) } });
  await app.request("/api/lessons/next", json({}, cookie));
  const before = await roadmapOf(app, cookie);
  expect((await app.request(`/api/roadmap/units/${units[0].id}/skip`, json({}, cookie))).status).toBe(200);
  const after = await roadmapOf(app, cookie);
  expect(after.map((u) => u.lessonOutline)).toEqual(before.map((u) => u.lessonOutline));
  expect(after.slice(0, 2).map((u) => u.status)).toEqual(["skipped", "active"]);
  expect(after[0].lessons[0].status).toBe("abandoned");
});

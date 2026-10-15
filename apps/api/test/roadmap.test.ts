import { describe, expect, test } from "bun:test";
import { reportReply, takeWrittenAssessment, unitsReply } from "./fixtures";
import { del, get, json, makeApp, makeClock, mockChat, mockModel, signUp, type TestApp } from "./helpers";

const goalsOf = async (app: TestApp, cookie: string) => (await (await app.request("/api/goals", get(cookie))).json()) as any[];
const roadmapOf = async (app: TestApp, cookie: string) => (await (await app.request("/api/roadmap", get(cookie))).json()) as any[];

const setup = ({ report = reportReply(), roadmap = [unitsReply()] as unknown[] } = {}) => {
  const clock = makeClock();
  const roadmapModel = mockModel(...roadmap);
  const app = makeApp({
    now: clock,
    models: { step: mockChat("Hello!"), report: mockModel(report), roadmap: roadmapModel, brief: mockModel("Brief.", "Brief.") },
  });
  return { app, clock, roadmapModel };
};

describe("confirm Goals → Roadmap", () => {
  test("confirming the proposed Goal builds a Roadmap of Units in order, first active and the rest planned", async () => {
    const { app, clock, roadmapModel } = setup({ roadmap: [unitsReply(9)] });
    const { cookie } = await signUp(app);
    await takeWrittenAssessment(app, cookie, clock);
    expect(await roadmapOf(app, cookie)).toEqual([]);

    const [proposed] = await goalsOf(app, cookie);
    const res = await app.request(`/api/goals/${proposed.id}/confirm`, json({}, cookie));
    expect(res.status).toBe(200);

    const units = await roadmapOf(app, cookie);
    expect(units).toHaveLength(9);
    expect(units.map((u) => u.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(units.map((u) => u.status)).toEqual(["active", ...Array(8).fill("planned")]);
    expect(units[0]).toMatchObject({ title: "Unit 1", objective: "Unit objective 1", skills: ["vocabulary", "fluency"], endsWithRoleplay: false });
    expect(units[8]).toMatchObject({ endsWithRoleplay: true });
    // Built from the Goals, the Skill Profile and the weaknesses.
    const prompt = JSON.stringify(roadmapModel.doGenerateCalls[0]!.prompt);
    expect(prompt).toContain("job_interview");
    expect(prompt).toContain("Past simple vs present perfect");
  });

  test("a proposed Goal can be edited as it's confirmed", async () => {
    const { app, clock } = setup();
    const { cookie } = await signUp(app);
    await takeWrittenAssessment(app, cookie, clock);
    const [proposed] = await goalsOf(app, cookie);

    const res = await app.request(
      `/api/goals/${proposed.id}/confirm`,
      json({ kind: "client_communication", targetLevels: { fluency: "C1", grammar: "B2", vocabulary: "B2" } }, cookie),
    );
    expect(await res.json()).toMatchObject({
      kind: "client_communication",
      status: "confirmed",
      targetLevels: { fluency: "C1", grammar: "B2", vocabulary: "B2" },
    });
  });

  test("the Roadmap waits until no proposed Goals are left, so it covers all of them", async () => {
    const report = reportReply({
      proposedGoals: [
        { kind: "job_interview", targetLevels: { grammar: "B2" } },
        { kind: "client_communication", targetLevels: { grammar: "B2" } },
      ],
    });
    const { app, clock } = setup({ report });
    const { cookie } = await signUp(app);
    await takeWrittenAssessment(app, cookie, clock);
    const [first, second] = await goalsOf(app, cookie);

    await app.request(`/api/goals/${first.id}/confirm`, json({}, cookie));
    expect(await roadmapOf(app, cookie)).toEqual([]);

    // Turning down the other proposal also counts.
    await app.request(`/api/goals/${second.id}`, del(cookie));
    expect(await roadmapOf(app, cookie)).toHaveLength(8);
  });

  test("Goals the Learner set and confirmed before the Assessment get a Roadmap when it completes", async () => {
    const { app, clock } = setup();
    const { cookie } = await signUp(app);
    const goal = (await (await app.request("/api/goals", json({ kind: "general_fluency" }, cookie))).json()) as any;
    await app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie));
    expect(await roadmapOf(app, cookie)).toEqual([]); // no Skill Profile yet

    await takeWrittenAssessment(app, cookie, clock);
    expect(await roadmapOf(app, cookie)).toHaveLength(8);
  });

  test("invalid Unit output fails cleanly, and the Roadmap can be built again", async () => {
    const { app, clock } = setup({ roadmap: [unitsReply(7), unitsReply(10)] });
    const { cookie } = await signUp(app);
    await takeWrittenAssessment(app, cookie, clock);
    const [proposed] = await goalsOf(app, cookie);

    const res = await app.request(`/api/goals/${proposed.id}/confirm`, json({}, cookie));
    expect(res.status).toBe(502);
    expect(await roadmapOf(app, cookie)).toEqual([]);
    expect((await goalsOf(app, cookie))[0]).toMatchObject({ status: "confirmed" });

    const retry = await app.request("/api/roadmap", json({}, cookie));
    expect(retry.status).toBe(201);
    expect(await roadmapOf(app, cookie)).toHaveLength(10);
  });

  test("building the Roadmap needs a confirmed Goal and a Skill Profile", async () => {
    const { app } = setup();
    const { cookie } = await signUp(app);
    expect((await app.request("/api/roadmap", json({}, cookie))).status).toBe(409);
  });

  test("an existing Roadmap isn't rebuilt when another Goal is confirmed", async () => {
    const { app, clock, roadmapModel } = setup();
    const { cookie } = await signUp(app);
    await takeWrittenAssessment(app, cookie, clock);
    const [proposed] = await goalsOf(app, cookie);
    await app.request(`/api/goals/${proposed.id}/confirm`, json({}, cookie));

    const extra = (await (await app.request("/api/goals", json({ kind: "general_fluency" }, cookie))).json()) as any;
    await app.request(`/api/goals/${extra.id}/confirm`, json({}, cookie));
    expect(roadmapModel.doGenerateCalls).toHaveLength(1);
    expect(await roadmapOf(app, cookie)).toHaveLength(8);
  });
});

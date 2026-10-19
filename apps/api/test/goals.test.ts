import { describe, expect, test } from "bun:test";
import { schema } from "@impromptu/db";
import { eq } from "drizzle-orm";
import { del, get, json, makeApp, mockModel, signUp } from "./helpers";
import { testDb } from "./setup";

const cv = "Backend engineer, 4 years at a fintech in Pune. Applying for senior roles at product companies in Berlin.";

describe("goals", () => {
  test("a Learner creates Goals with Goal Context and Target Levels and lists them", async () => {
    const app = makeApp();
    const { cookie } = await signUp(app);

    const created = await app.request(
      "/api/goals",
      json(
        { kind: "job_interview", context: cv, targetLevels: { fluency: "C1", grammar: "B2", vocabulary: "C1" } },
        cookie,
      ),
    );
    expect(created.status).toBe(201);
    await app.request("/api/goals", json({ kind: "general_fluency" }, cookie));

    const list = await app.request("/api/goals", get(cookie));
    expect(list.status).toBe(200);
    // Both are created at the same frozen test time, so their order isn't part of the check.
    const goals = ((await list.json()) as any[]).sort((a, b) => a.kind.localeCompare(b.kind));
    expect(goals).toHaveLength(2);
    expect(goals[0]).toMatchObject({ kind: "general_fluency", status: "proposed" });
    expect(goals[1]).toMatchObject({
      kind: "job_interview",
      status: "proposed",
      targetLevels: { fluency: "C1", grammar: "B2", vocabulary: "C1" },
      brief: null,
    });
  });

  test("a Learner can write a Goal in their own words", async () => {
    const app = makeApp();
    const { cookie } = await signUp(app);

    const response = await app.request(
      "/api/goals",
      json({ statement: "Pass the IELTS speaking test with a 7.5." }, cookie),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      statement: "Pass the IELTS speaking test with a 7.5.",
      kind: "general_fluency",
      status: "proposed",
    });

    const [goal] = (await (await app.request("/api/goals", get(cookie))).json()) as any[];
    expect(goal.statement).toBe("Pass the IELTS speaking test with a 7.5.");
  });

  test("a Goal needs a statement or a kind", async () => {
    const app = makeApp();
    const { cookie } = await signUp(app);

    expect((await app.request("/api/goals", json({}, cookie))).status).toBe(400);
    expect((await app.request("/api/goals", json({ statement: "  " }, cookie))).status).toBe(400);
  });

  test("a Learner only sees their own Goals", async () => {
    const app = makeApp();
    const asha = await signUp(app);
    const ravi = await signUp(app);
    await app.request("/api/goals", json({ kind: "job_interview" }, asha.cookie));

    expect(await (await app.request("/api/goals", get(ravi.cookie))).json()).toEqual([]);
  });

  test("Goal Context longer than 20,000 characters is rejected with a clear error", async () => {
    const app = makeApp();
    const { cookie } = await signUp(app);

    const res = await app.request("/api/goals", json({ kind: "job_interview", context: "x".repeat(20_001) }, cookie));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("20,000 characters");

    const ok = await app.request("/api/goals", json({ kind: "job_interview", context: "x".repeat(20_000) }, cookie));
    expect(ok.status).toBe(201);
  });

  test("confirming a Goal writes a Learner Brief from the Goal Context and logs the AI call", async () => {
    const brief = mockModel(
      "Asha is a backend engineer with four years in fintech, aiming for senior roles in Berlin.",
    );
    const app = makeApp({ models: { brief } });
    const { cookie, id: learnerId } = await signUp(app);
    const context = `${cv}\n\nI can spend 2 hours per week practising.\n\nI would like to reach my Goal in 4–8 weeks.`;
    const goal = (await (
      await app.request(
        "/api/goals",
        json({ statement: "Become a senior backend engineer.", kind: "job_interview", context }, cookie),
      )
    ).json()) as any;

    const res = await app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "confirmed",
      brief: "Asha is a backend engineer with four years in fintech, aiming for senior roles in Berlin.",
    });
    const prompt = JSON.stringify(brief.doGenerateCalls[0]!.prompt);
    expect(prompt).toContain("Become a senior backend engineer.");
    expect(prompt).toContain("4 years at a fintech in Pune");
    expect(prompt).toContain("2 hours per week");
    expect(prompt).toContain("4–8 weeks");
    expect(prompt).toContain("Preserve any weekly practice time and desired Goal completion range");

    const usage = await testDb.select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, learnerId));
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ kind: "text", callId: expect.stringMatching(/^resp-/) });
    expect(usage[0]!.usage).toMatchObject({ inputTokens: 120, outputTokens: 80 });
  });

  test("confirming a Goal without Goal Context needs no Brief and makes no AI call", async () => {
    const app = makeApp();
    const { cookie } = await signUp(app);
    const goal = (await (await app.request("/api/goals", json({ kind: "general_fluency" }, cookie))).json()) as any;

    const res = await app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie));
    expect(await res.json()).toMatchObject({ status: "confirmed", brief: null });
  });

  test("confirming a Goal can rewrite its statement", async () => {
    const app = makeApp();
    const { cookie } = await signUp(app);
    const goal = (await (
      await app.request("/api/goals", json({ statement: "Speak at conferences." }, cookie))
    ).json()) as any;

    const res = await app.request(
      `/api/goals/${goal.id}/confirm`,
      json({ statement: "Give a 10-minute talk at a conference." }, cookie),
    );
    expect(await res.json()).toMatchObject({
      kind: "general_fluency",
      statement: "Give a 10-minute talk at a conference.",
      status: "confirmed",
    });
  });

  test("deleting a Goal removes its Goal Context and Brief", async () => {
    const app = makeApp({ models: { brief: mockModel("A short Brief.") } });
    const { cookie } = await signUp(app);
    const goal = (await (
      await app.request("/api/goals", json({ kind: "job_interview", context: cv }, cookie))
    ).json()) as any;
    await app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie));

    const res = await app.request(`/api/goals/${goal.id}`, del(cookie));
    expect(res.status).toBe(204);
    expect(await (await app.request("/api/goals", get(cookie))).json()).toEqual([]);
    expect(await testDb.select().from(schema.goal).where(eq(schema.goal.id, goal.id))).toEqual([]);
  });

  test("a Learner can't confirm or delete someone else's Goal", async () => {
    const app = makeApp();
    const asha = await signUp(app);
    const ravi = await signUp(app);
    const goal = (await (
      await app.request("/api/goals", json({ kind: "general_fluency" }, asha.cookie))
    ).json()) as any;

    expect((await app.request(`/api/goals/${goal.id}/confirm`, json({}, ravi.cookie))).status).toBe(404);
    expect((await app.request(`/api/goals/${goal.id}`, del(ravi.cookie))).status).toBe(404);
  });
});

import { expect, test } from "bun:test";
import { get, json, makeApp, signUp } from "./helpers";

test("Roleplay history contains only this Learner's sessions and excludes transcripts", async () => {
  const app = makeApp();
  const a = await signUp(app);
  const b = await signUp(app);
  for (const learner of [a, b]) {
    const goal = (await (
      await app.request("/api/goals", json({ kind: "job_interview" }, learner.cookie))
    ).json()) as any;
    await app.request("/api/roleplays", json({ goalId: goal.id, textMode: true }, learner.cookie));
  }
  const response = await app.request("/api/roleplays", get(a.cookie));
  expect(response.status).toBe(200);
  const rows = (await response.json()) as any[];
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ title: "Mock Interview", status: "in_progress", textMode: true });
  expect(rows[0]).not.toHaveProperty("messages");
  expect((await app.request("/api/roleplays")).status).toBe(401);
});

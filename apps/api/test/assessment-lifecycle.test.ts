import { describe, expect, test } from "bun:test";
import { reportReply, takeWrittenAssessment } from "./fixtures";
import {
  fakeMailer,
  get,
  json,
  makeApp,
  makeClock,
  mockChat,
  mockModel,
  signUp,
  userMessage,
  WEB_ORIGIN,
  type TestApp,
} from "./helpers";

const start = async (app: TestApp, cookie: string) =>
  app.request("/api/assessments", json({ mode: "written" }, cookie));

async function startAndChat(app: TestApp, cookie: string) {
  const { id } = (await (await start(app, cookie)).json()) as { id: string };
  await (await app.request(`/api/assessments/${id}/chat`, json({ message: userMessage("Hi") }, cookie))).text();
  return id;
}

const read = async (app: TestApp, cookie: string, id: string) =>
  (await (await app.request(`/api/assessments/${id}`, get(cookie))).json()) as any;

const setup = (reports: unknown[] = [], mailer = fakeMailer()) => {
  const clock = makeClock();
  const app = makeApp({
    now: clock,
    mailer,
    models: { step: mockChat(...Array(5).fill("Hello!")), report: mockModel(...reports) },
  });
  return { app, clock, mailer };
};
const reportEmails = (mailer: ReturnType<typeof fakeMailer>) =>
  mailer.sent.filter((email) => typeof email.subject === "string" && email.subject.includes("Assessment Report"));

describe("assessment lifecycle", () => {
  test("concurrent starts leave only one open Assessment", async () => {
    const { app } = setup();
    const { cookie } = await signUp(app);
    const results = await Promise.all(Array.from({ length: 6 }, () => start(app, cookie)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const all = (await (await app.request("/api/assessments", get(cookie))).json()) as { status: string }[];
    expect(all.filter((a) => a.status === "in_progress")).toHaveLength(1);
  });
  test("two requests ending the same Assessment persist one Report and one set of learning results", async () => {
    const { app, clock, mailer } = setup([reportReply(), reportReply()]);
    const { cookie, id: userId } = await signUp(app);
    const id = await startAndChat(app, cookie);
    clock.advance({ minutes: 10 });
    const results = await Promise.all([0, 1].map(() => app.request(`/api/assessments/${id}/end`, json({}, cookie))));
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    await app.runJobs(userId);
    expect(await (await app.request("/api/skill-profile/history", get(cookie))).json()).toHaveLength(2);
    expect(await (await app.request("/api/focus-items", get(cookie))).json()).toHaveLength(3);
    expect(reportEmails(mailer)).toHaveLength(1);
  });
  test("an attempt ended under 4 minutes is discarded without a Report and doesn't block a new one", async () => {
    const { app, clock } = setup();
    const { cookie } = await signUp(app);
    const id = await startAndChat(app, cookie);

    clock.advance({ minutes: 3, seconds: 59 });
    const end = await app.request(`/api/assessments/${id}/end`, json({}, cookie));
    expect(end.status).toBe(200);
    expect(await end.json()).toMatchObject({ status: "discarded" });
    expect(await read(app, cookie, id)).toMatchObject({ status: "discarded", report: null });
    expect(await (await app.request("/api/skill-profile", get(cookie))).json()).toMatchObject({ grammar: null });

    expect((await start(app, cookie)).status).toBe(201);
  });

  test("a Written Assessment answered in full counts even when finished in under 4 minutes", async () => {
    const clock = makeClock();
    const app = makeApp({
      now: clock,
      models: { step: mockChat(...Array(13).fill("Next question?")), report: mockModel(reportReply()) },
    });
    const { cookie } = await signUp(app);
    const id = await startAndChat(app, cookie);
    for (let i = 0; i < 12; i++)
      await (
        await app.request(`/api/assessments/${id}/chat`, json({ message: userMessage(`Answer ${i}`) }, cookie))
      ).text();

    clock.advance({ minutes: 2 });
    const end = await app.request(`/api/assessments/${id}/end`, json({}, cookie));
    expect(await end.json()).toMatchObject({ status: "completed" });
  });

  test("an attempt the Learner leaves at 4 minutes produces a partial Report and counts as completed", async () => {
    const { app, clock } = setup([reportReply()]);
    const { cookie } = await signUp(app);
    const id = await startAndChat(app, cookie);

    clock.advance({ minutes: 4 });
    const end = await app.request(`/api/assessments/${id}/end`, json({ left: true }, cookie));
    expect(end.status).toBe(200);
    expect(await read(app, cookie, id)).toMatchObject({ status: "completed", report: { partial: true } });
  });

  test("an attempt that runs its course gives a full Report", async () => {
    const { app, clock } = setup([reportReply()]);
    const { cookie } = await signUp(app);
    const { id } = await takeWrittenAssessment(app, cookie, clock);

    expect(await read(app, cookie, id)).toMatchObject({ status: "completed", report: { partial: false } });
  });

  test("an attempt left open is wrapped up when the Learner starts again: partial Report if it ran 4+ minutes", async () => {
    const { app, clock } = setup([reportReply()]);
    const { cookie } = await signUp(app);
    const abandoned = await startAndChat(app, cookie);
    clock.advance({ minutes: 6 });

    // The abandoned attempt now counts as completed, so the new one hits the weekly limit.
    expect((await start(app, cookie)).status).toBe(429);
    expect(await read(app, cookie, abandoned)).toMatchObject({ status: "completed", report: { partial: true } });
  });

  test("an attempt left open under 4 minutes is discarded when the Learner starts again", async () => {
    const { app, clock } = setup();
    const { cookie } = await signUp(app);
    const abandoned = await startAndChat(app, cookie);
    clock.advance({ minutes: 2 });

    expect((await start(app, cookie)).status).toBe(201);
    expect(await read(app, cookie, abandoned)).toMatchObject({ status: "discarded" });
  });

  test("a retake within 7 days of the last completed Assessment is refused; day 7 is allowed", async () => {
    const { app, clock } = setup([reportReply()]);
    const { cookie } = await signUp(app);
    await takeWrittenAssessment(app, cookie, clock); // completed at 09:10

    clock.advance({ days: 6, minutes: 59 * 24 });
    const refused = await start(app, cookie);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ nextAllowedAt: "2026-10-22T09:10:00.000Z" });

    clock.set("2026-10-22T09:10:00Z");
    expect((await start(app, cookie)).status).toBe(201);
  });

  test("a retake keeps earlier Reports readable", async () => {
    const second = reportReply({
      skills: { grammar: { score: 70, evidence: ["x"] }, vocabulary: { score: 75, evidence: ["y"] }, fluency: null },
    });
    const { app, clock } = setup([reportReply(), second]);
    const { cookie } = await signUp(app);
    const first = await takeWrittenAssessment(app, cookie, clock);
    clock.advance({ days: 7 });
    await takeWrittenAssessment(app, cookie, clock);

    const list = (await (await app.request("/api/assessments", get(cookie))).json()) as any[];
    expect(list.map((a) => a.report.overallLevel)).toEqual(["B1", "C1"]);
    expect(await read(app, cookie, first.id)).toMatchObject({ report: { overallLevel: "B1" } });
  });

  test("the overall level is worked out from the skill scores, not taken from the model", async () => {
    const { app, clock } = setup([reportReply({ overallLevel: "C2" })]);
    const { cookie } = await signUp(app);
    const taken = await takeWrittenAssessment(app, cookie, clock);
    // grammar 42 and vocabulary 55 average 48.5, which is B1
    expect(await read(app, cookie, taken.id)).toMatchObject({ report: { overallLevel: "B1" } });
  });
});

describe("first-Report email", () => {
  test("the first completed Report is emailed once with a link to the first Lesson; later Reports send nothing", async () => {
    const { app, clock, mailer } = setup([reportReply(), reportReply()]);
    const { cookie } = await signUp(app);
    const me = (await (await app.request("/api/me", get(cookie))).json()) as any;

    const first = await takeWrittenAssessment(app, cookie, clock);
    const [reportEmail] = reportEmails(mailer);
    expect(reportEmail).toMatchObject({ to: me.email, subject: expect.stringContaining("Assessment Report") });
    expect(reportEmail!.html).toContain(`href="${WEB_ORIGIN}/"`);
    expect(reportEmail!.text).toContain(`Start your first Lesson: ${WEB_ORIGIN}/`);
    expect(reportEmail!.html).toContain("Fluency: Not measured yet");
    expect(reportEmail!.html).toContain("Past simple vs present perfect");
    expect((await read(app, cookie, first.id)).emailedAt).not.toBeNull();

    clock.advance({ days: 7 });
    await takeWrittenAssessment(app, cookie, clock);
    expect(mailer.sent).toHaveLength(2);
  });

  test("a discarded attempt sends nothing; the first completed one after it is emailed", async () => {
    const { app, clock, mailer } = setup([reportReply()]);
    const { cookie } = await signUp(app);
    const id = await startAndChat(app, cookie);
    clock.advance({ minutes: 1 });
    await app.request(`/api/assessments/${id}/end`, json({}, cookie));
    expect(reportEmails(mailer)).toHaveLength(0);

    await takeWrittenAssessment(app, cookie, clock);
    expect(reportEmails(mailer)).toHaveLength(1);
  });

  test("an email that fails to send doesn't lose the Report, and the worker retries it", async () => {
    let fail = true;
    const sent: unknown[] = [];
    const mailer = {
      send: async (e: unknown) => {
        if (fail) throw new Error("Resend is down");
        sent.push(e);
      },
    };
    const clock = makeClock();
    const app = makeApp({
      now: clock,
      mailer,
      models: { step: mockChat("Hi", "Hi"), report: mockModel(reportReply(), reportReply()) },
    });
    const { cookie } = await signUp(app);

    const { id, end } = await takeWrittenAssessment(app, cookie, clock);
    expect(end.status).toBe(200);
    expect(await read(app, cookie, id)).toMatchObject({ status: "completed", emailedAt: null });

    fail = false;
    clock.advance({ seconds: 5 });
    const me = (await (await app.request("/api/me", get(cookie))).json()) as { id: string };
    await app.runJobs(me.id);
    expect(sent).toHaveLength(1);
  });
});

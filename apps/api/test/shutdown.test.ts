import { expect, test } from "bun:test";
import type { Deps } from "../src/app";
import { startAssessmentJobs } from "../src/assessment-jobs";
import { startStreakReminders } from "../src/streak-reminders";
import {
  fakeMailer,
  fakeRealtime,
  fakeSpeech,
  fakeTranscriber,
  get,
  json,
  makeApp,
  makeClock,
  mockModel,
  signUp,
  WEB_ORIGIN,
} from "./helpers";
import { testDb } from "./setup";

test("shutdown fails readiness, rejects new API work and drains retained AI tasks", async () => {
  const app = makeApp();
  const work = Promise.withResolvers<void>();
  app.post("/api/shutdown/answer", (c) => {
    c.var.retainAiTask(work.promise);
    return c.json({ saved: true });
  });
  const { cookie } = await signUp(app);
  expect((await app.request("/api/shutdown/answer", json({}, cookie))).status).toBe(200);
  let drained = false;
  const pending = app.drain().then(() => {
    drained = true;
  });
  await app.shutdown();
  expect(drained).toBe(false);
  expect((await app.request("/health/ready")).status).toBe(503);
  expect((await app.request("/health/live")).status).toBe(200);
  for (const path of ["/api/auth/providers", "/api/me", "/api/shutdown/answer"]) {
    const response = await app.request(path, get(cookie));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("1");
  }
  work.reject(new Error("analysis failed during shutdown"));
  await pending;
  expect(drained).toBe(true);
});

test("stream cancellation still waits for retained AI work during shutdown", async () => {
  const app = makeApp();
  const work = Promise.withResolvers<void>();
  app.get("/api/shutdown-stream", (c) => {
    c.var.retainAiTask(work.promise);
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("data: first\n\n"));
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  const { cookie } = await signUp(app);
  const response = await app.request("/api/shutdown-stream", get(cookie));
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("data: first\n\n");
  await app.shutdown();
  let drained = false;
  const pending = app.drain().then(() => {
    drained = true;
  });
  await reader.cancel();
  expect(drained).toBe(false);
  work.resolve();
  await pending;
  expect(drained).toBe(true);
});

test.each(["assessment", "reminders"] as const)("%s worker stop waits for its active batch", async (kind) => {
  const entered = Promise.withResolvers<void>();
  const batch = Promise.withResolvers<never[]>();
  const wait = () => {
    entered.resolve();
    return batch.promise;
  };
  const db = new Proxy(testDb, {
    get(target, key, receiver) {
      if (kind === "assessment" && key === "transaction") return wait;
      if (kind === "reminders" && key === "selectDistinct")
        return () => ({ from: () => ({ innerJoin: () => ({ leftJoin: () => ({ where: wait }) }) }) });
      return Reflect.get(target, key, receiver);
    },
  });
  const model = mockModel();
  const deps: Deps = {
    db,
    now: makeClock(),
    models: { step: model, brief: model, roadmap: model, judge: model, report: model },
    env: {
      BETTER_AUTH_SECRET: "synthetic-shutdown-secret-at-least-32-chars",
      BETTER_AUTH_URL: "http://localhost:3000",
      WEB_ORIGIN,
    },
    mailer: fakeMailer(),
    realtime: fakeRealtime(),
    speech: fakeSpeech(),
    transcriber: fakeTranscriber(),
  };
  const stop = kind === "assessment" ? startAssessmentJobs(deps) : startStreakReminders(deps);
  await entered.promise;
  let stopped = false;
  const stopping = stop().then(() => {
    stopped = true;
  });
  await Bun.sleep(0);
  expect(stopped).toBe(false);
  batch.resolve([]);
  await stopping;
  await stop();
  expect(stopped).toBe(true);
});

test.each([
  ["SIGTERM", "normal", 0],
  ["SIGINT", "normal", 0],
  ["SIGTERM", "blocked-worker", 1],
  ["SIGINT", "blocked-db", 1],
  ["SIGTERM", "failed-call", 1],
] as const)(
  "%s drains or bounds %s shutdown (exit %s)",
  async (signal, mode, exitCode) => {
    const child = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `
      import { installShutdown } from "./src/shutdown.ts";
      const mode = ${JSON.stringify(mode)};
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const server = Bun.serve({ port: 0, fetch: () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("first"));
          setTimeout(() => {
            controller.enqueue(new TextEncoder().encode("last"));
            controller.close();
            console.log("body-done");
          }, 40);
        }
      })) });
      installShutdown(
        { stop: (force) => { console.log(force ? "server-forced" : "server-stopped"); return server.stop(force); } },
        {
          shutdown: async () => {
            console.log("calls-stopping");
            await wait(20);
            if (mode === "failed-call") throw new Error("call save failed");
            console.log("calls-done");
          },
          drain: async () => { await wait(20); console.log("ai-done"); }
        },
        { $client: { end: async ({ timeout }) => {
          console.log("db-close-" + timeout);
          if (mode === "blocked-db") await new Promise(() => {});
        } } },
        [async () => {
          console.log("worker-stopped");
          if (mode === "blocked-worker") await new Promise(() => {});
          await wait(60);
          console.log("worker-done");
        }],
        mode === "normal" || mode === "failed-call" ? 2_000 : 200,
      );
      console.log(server.url.href);
    `,
      ],
      {
        cwd: new URL("..", import.meta.url).pathname,
        env: { PATH: process.env.PATH },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const reader = child.stdout.getReader();
    let output = "";
    const decoder = new TextDecoder();
    const readRest = async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        output += decoder.decode(value);
      }
    };
    try {
      output = decoder.decode((await reader.read()).value);
      const url = output.trim();
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      process.kill(child.pid, signal);
      // Repeated signals must share one drain, not close the DB twice.
      process.kill(child.pid, signal === "SIGTERM" ? "SIGINT" : "SIGTERM");
      expect(await response.text()).toBe("firstlast");
      const [code, , stderr] = await Promise.all([child.exited, readRest(), new Response(child.stderr).text()]);
      expect(code, stderr).toBe(exitCode);
      expect(output.match(/worker-stopped/g)).toHaveLength(1);
      if (mode === "blocked-worker" || mode === "blocked-db") {
        expect(stderr).toContain("Shutdown grace period expired");
        expect(output).toContain("server-forced");
        expect(output).toContain("db-close-0");
      } else {
        expect(output).not.toContain("server-forced");
        for (const step of ["body-done", "worker-done", "ai-done"]) {
          expect(output.indexOf(step)).toBeGreaterThan(-1);
          expect(output.indexOf(step)).toBeLessThan(output.indexOf("db-close-5"));
        }
        expect(output.match(/db-close-5/g)).toHaveLength(1);
        if (mode === "normal") expect(output.indexOf("calls-done")).toBeLessThan(output.indexOf("db-close-5"));
        else expect(stderr).toContain("call save failed");
      }
    } finally {
      child.kill();
      reader.releaseLock();
    }
  },
  10_000,
);

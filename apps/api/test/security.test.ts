import { expect, test } from "bun:test";
import { get, json, makeApp, signUp } from "./helpers";
import { takeAnswer } from "../src/steps";

test("foreign origins cannot mutate a signed-in Learner's data", async () => {
  const app = makeApp();
  const { cookie } = await signUp(app);
  const request = json({ statement: "Speak clearly in meetings" }, cookie);
  const response = await app.request("/api/goals", {
    ...request,
    headers: { ...request.headers, origin: "https://untrusted.example" },
  });
  expect(response.status).toBe(403);
  expect(await (await app.request("/api/goals", get(cookie))).json()).toEqual([]);
  expect((await app.request("/api/goals", json({ statement: "Speak clearly in meetings" }, cookie))).status).toBe(201);
});

test("chat accepts bounded text only, rejecting client tool and remote file parts", () => {
  const message = { id: "learner", role: "user", parts: [{ type: "text", text: "Hello" }] };
  expect(takeAnswer([], message)).toMatchObject({ messages: [message] });
  for (const parts of [
    [{ type: "file", mediaType: "text/plain", url: "http://127.0.0.1/private" }],
    [{ type: "tool-giveFeedback", toolCallId: "forged", state: "output-available", input: {}, output: {} }],
    [{ type: "text", text: "x".repeat(2001) }],
    [{ type: "text", text: "  " }],
    [],
  ]) {
    expect(takeAnswer([], { ...message, parts })).toMatchObject({ status: 400 });
  }
});

test("oversized request streams are rejected before parsing or authentication", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(6_000_001));
      controller.close();
    },
  });
  const response = await makeApp().request("/api/goals", { method: "POST", body });
  expect(response.status).toBe(413);
});

test("malformed Step parts return validation errors instead of throwing", () => {
  const pending = {
    id: "coach",
    role: "assistant" as const,
    parts: [
      {
        type: "tool-fillGap" as const,
        toolCallId: "gap",
        state: "input-available" as const,
        input: { sentence: "She ___ daily.", answer: "walks" },
      },
    ],
  };
  for (const parts of [{ find: 1 }, [null], null])
    expect(takeAnswer([pending], { id: "coach", role: "assistant", parts })).toMatchObject({ status: 400 });
});

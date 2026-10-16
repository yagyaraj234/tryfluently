import assert from "node:assert/strict";
import { test } from "node:test";
import { Chat } from "@ai-sdk/react";
import { answerStep, chatOptions } from "../src/chat.ts";

// The server keeps the chat history, so each request carries only the newest message.
// A fake fetch records what is sent and replies with the given UI message stream chunks.
function fakeServer(...replies) {
  const sent = [];
  const fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    // Like streamText, every reply is one step of the assistant message.
    const [start, ...rest] = replies.shift();
    const chunks = [start, { type: "start-step" }, ...rest, { type: "finish-step" }, { type: "finish" }];
    const sse = [...chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`), "data: [DONE]\n\n"].join("");
    return new Response(sse, { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
  };
  return { sent, fetch };
}

const until = async (check) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  assert.ok(check());
};

const stored = [
  { id: "u1", role: "user", parts: [{ type: "text", text: "Hi" }] },
  { id: "a1", role: "assistant", parts: [{ type: "text", text: "Hello! What do you do?" }] },
];

test("sending a message posts only that message as { message }", async () => {
  const server = fakeServer([{ type: "start", messageId: "a2" }]);
  const chat = new Chat(chatOptions("/api/assessments/7/chat", stored, server.fetch));
  await chat.sendMessage({ text: "I'm a nurse." });

  assert.equal(server.sent.length, 1);
  assert.equal(server.sent[0].url, "/api/assessments/7/chat");
  assert.deepEqual(Object.keys(server.sent[0].body), ["message"]);
  assert.equal(server.sent[0].body.message.role, "user");
  assert.deepEqual(server.sent[0].body.message.parts, [{ type: "text", text: "I'm a nurse." }]);
});

test("answering a Step adds { answer } to the last assistant message and sends it", async () => {
  const fillGap = { sentence: "I ___ here since 2020.", answer: "have worked" };
  const server = fakeServer(
    [
      { type: "start", messageId: "a2" },
      { type: "tool-input-available", toolCallId: "call-1", toolName: "fillGap", input: fillGap },
    ],
    [{ type: "start", messageId: "a2" }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Thanks!" }, { type: "text-end", id: "t" }],
  );
  const chat = new Chat(chatOptions("/api/assessments/7/chat", stored, server.fetch));
  await chat.sendMessage({ text: "Ready" });
  const step = chat.messages.at(-1).parts.find((p) => p.type === "tool-fillGap");
  assert.equal(step.state, "input-available");

  await answerStep(chat, step, "have worked");
  await until(() => server.sent.length === 2 && chat.status === "ready");

  const { message } = server.sent[1].body;
  assert.equal(message.id, "a2");
  assert.equal(message.role, "assistant");
  const answered = message.parts.find((p) => p.toolCallId === "call-1");
  assert.equal(answered.state, "output-available");
  assert.deepEqual(answered.output, { answer: "have worked" });
  assert.deepEqual(Object.keys(server.sent[1].body), ["message"]);
});

test("a chat resumes from the stored messages", () => {
  const chat = new Chat(chatOptions("/api/assessments/7/chat", stored));
  assert.deepEqual(
    chat.messages.map((m) => m.id),
    ["u1", "a1"],
  );
});

test("a recorded answer goes back as { recordingId }", async () => {
  const server = fakeServer([{ type: "start", messageId: "a1" }]);
  const pending = { type: "tool-vocabCard", toolCallId: "call-2", state: "input-available", input: { word: "deadline" } };
  const chat = new Chat(chatOptions("/api/lessons/1/chat", [{ id: "a1", role: "assistant", parts: [pending] }], server.fetch));
  await answerStep(chat, pending, { recordingId: "r1" });
  assert.deepEqual(server.sent[0].body.message.parts[0].output, { recordingId: "r1" });
});

test("a finished turn isn't sent again on its own, even when every tool in it has its output", async () => {
  // The end of a Lesson: giveFeedback and endLesson both run on the server.
  const server = fakeServer([
    { type: "start", messageId: "a2" },
    { type: "tool-input-available", toolCallId: "fb", toolName: "giveFeedback", input: {} },
    { type: "tool-output-available", toolCallId: "fb", output: { saved: true } },
    { type: "tool-input-available", toolCallId: "end", toolName: "endLesson", input: {} },
    { type: "tool-output-available", toolCallId: "end", output: { ended: true } },
  ]);
  const chat = new Chat(chatOptions("/api/lessons/1/chat", [], server.fetch));
  await chat.sendMessage({ text: "Let's start." });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(server.sent.length, 1);
});

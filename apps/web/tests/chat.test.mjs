import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let vite, chat, Chat;

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  chat = await vite.ssrLoadModule("/src/chat.ts");
  ({ Chat } = await vite.ssrLoadModule("@ai-sdk/react"));
});

after(() => vite.close());

// A fake fetch that records each request body and answers with an empty UI message stream.
function recorder() {
  const bodies = [];
  const fetch = async (url, init) => {
    bodies.push({ url, body: JSON.parse(init.body) });
    return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
  };
  return { bodies, fetch };
}

const pendingStep = {
  id: "a1",
  role: "assistant",
  parts: [{ type: "tool-fillGap", toolCallId: "call-1", state: "input-available", input: { sentence: "She ___ to work.", answer: "goes" } }],
};
const history = [{ id: "u1", role: "user", parts: [{ type: "text", text: "Let's start." }] }, pendingStep];

test("only the newest message is sent, as { message }", async () => {
  const { bodies, fetch } = recorder();
  const c = new Chat({ messages: [], transport: chat.chatTransport("/api/lessons/l1/chat", fetch) });
  await c.sendMessage({ text: "Let's start." });
  await c.sendMessage({ text: "Next step, please." });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].url, "/api/lessons/l1/chat");
  assert.deepEqual(Object.keys(bodies[1].body), ["message"]);
  assert.equal(bodies[1].body.message.role, "user");
  assert.deepEqual(bodies[1].body.message.parts, [{ type: "text", text: "Next step, please." }]);
});

test("answering a Step attaches { answer } as the tool output on the last assistant message and sends it", async () => {
  const { bodies, fetch } = recorder();
  const c = new Chat({ messages: history, transport: chat.chatTransport("/api/lessons/l1/chat", fetch) });
  await chat.answerStep(c, pendingStep.parts[0], "goes");
  assert.equal(bodies.length, 1);
  const { message } = bodies[0].body;
  assert.equal(message.id, "a1");
  assert.deepEqual(
    message.parts.map((p) => [p.toolCallId, p.state, p.output]),
    [["call-1", "output-available", { answer: "goes" }]],
  );
});

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startWeb } from "./helpers.mjs";

const user = (text) => ({ id: `u-${text}`, role: "user", parts: [{ type: "text", text }] });
const step = (type, input, state = "input-available", output) => ({ type: `tool-${type}`, toolCallId: `c-${type}`, state, input, output });
const feedback = { type: "tool-giveFeedback", toolCallId: "c-fb", state: "output-available", input: { verdict: "almost", corrected: "x", explanation: "y" }, output: { saved: true, verdict: "almost" } };

const fillGap = { sentence: "They ___ football on Sundays.", answer: "play" };
const vocabCard = { word: "deadline", meaning: "the time by which something must be done", example: "The deadline is Friday." };
const rewrite = { sentence: "I am very very happy with the result.", aim: "Sound more natural by replacing 'very very'." };

const lesson = (id, over) => ({ id, kind: "practice", status: "in_progress", title: "Present simple", objective: "Use present simple", messages: [], steps: [], ...over });
const lessons = {
  fresh: lesson("fresh"),
  // Resumed at its second Step: the first was answered and got feedback.
  resumed: lesson("resumed", {
    messages: [user("Let's start."), { id: "a1", role: "assistant", parts: [step("vocabCard", vocabCard, "output-available", { answer: "We met the deadline." }), feedback, step("fillGap", fillGap)] }],
  }),
  vocab: lesson("vocab", { messages: [user("Let's start."), { id: "a1", role: "assistant", parts: [step("vocabCard", vocabCard)] }] }),
  rewrite: lesson("rewrite", { messages: [user("Let's start."), { id: "a1", role: "assistant", parts: [step("rewrite", rewrite)] }] }),
  done: lesson("done", { status: "completed" }),
  roleplay: lesson("roleplay", { kind: "roleplay" }),
};

let web;

before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (!/learner=/.test(req.headers.cookie ?? "")) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha" });
    if (req.url === "/api/progress") return json(200, { xp: 340, streak: 12 });
    const id = /^\/api\/lessons\/(\w+)$/.exec(req.url)?.[1];
    if (id && lessons[id]) return json(200, lessons[id]);
    json(404, { error: "Not found" });
  });
});

after(() => web.close());

const get = (path) => fetch(web.url + path, { headers: { cookie: "learner=asha" }, redirect: "manual" });

async function page(path) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  return (await response.text()).match(/<main[\s\S]*<\/main>/)[0];
}

const text = (html) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("a new Lesson waits while its first Step is prepared", async () => {
  const html = await page("/lessons/fresh");
  assert.match(html, /role="status"/);
  assert.match(text(html), /Preparing your first Step/);
});

test("a resumed Lesson continues at the open Step, numbered after the ones already done", async () => {
  const t = text(await page("/lessons/resumed"));
  assert.match(t, /Fill the gap · Step 2 of ~5/);
  assert.match(t, /They blank football on Sundays\./);
  assert.doesNotMatch(t, /play/, "the answer key is never shown");
  // Earlier feedback isn't shown again on resume.
  assert.doesNotMatch(t, /Almost/);
});

test("a vocabCard Step shows the word, meaning and example, and asks for the Learner's sentence", async () => {
  const html = await page("/lessons/vocab");
  const t = text(html);
  assert.match(t, /New word · Step 1 of ~5/);
  assert.match(html, /<h3[^>]*>deadline<\/h3>/);
  assert.match(t, /the time by which something must be done/);
  assert.match(t, /Your sentence/);
});

test("a rewrite Step asks the aim and quotes the sentence to improve", async () => {
  const html = await page("/lessons/rewrite");
  assert.match(html, /<h2[^>]*>Sound more natural by replacing &#x27;very very&#x27;\.<\/h2>/);
  assert.match(html, /<blockquote[^>]*>I am very very happy with the result\.<\/blockquote>/);
});

test("a finished Lesson shows Lesson complete with the Streak and the next actions", async () => {
  const html = await page("/lessons/done");
  const t = text(html);
  assert.match(t, /Lesson complete/);
  assert.match(t, /12 day streak/);
  assert.match(t, /Next Lesson/);
  assert.match(html, /<a\b[^>]*href="\/"[^>]*>[^<]*Home/);
});

test("a Roleplay Lesson opens on the Roleplay screen", async () => {
  const response = await get("/lessons/roleplay");
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), web.url).pathname, "/roleplays/roleplay");
  assert.match(text(await page("/roleplays/roleplay")), /Roleplay/);
});

test("closing the Lesson goes back to Home", async () => {
  const response = await get("/lessons/vocab");
  assert.match(await response.text(), /<a\b[^>]*href="\/"[^>]*aria-label="Close"|<a\b[^>]*aria-label="Close"[^>]*href="\/"/);
});

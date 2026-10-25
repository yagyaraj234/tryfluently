import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startWeb, text } from "./helpers.mjs";

const page = (n, over = {}) => ({
  page: n,
  status: "ready",
  question: "ready",
  title: `Idea ${n + 1}`,
  body: `Reading ${n + 1}.`,
  example: null,
  keyTerms: [],
  glossary: [],
  ...over,
});
const fillGap = { block: "fillGap", prompt: "She ___ to work." };
const choice = { block: "multipleChoice", prompt: "Which is right?", options: ["go", "goes"] };
const wrong = { block: "fillGap", answer: "go", verdict: "incorrect", correctAnswer: "goes", explanation: "Add -es." };
const right = { block: "multipleChoice", answer: 1, verdict: "correct", correctAnswer: 1, explanation: "Agreement." };
const item = (index, questionData, result) => ({ index, page: 0, round: 0, questionData, ...(result && { result }) });

const lesson = (id, currentPage, quiz, over = {}) => ({
  id,
  unitId: "u1",
  kind: "practice",
  status: "in_progress",
  title: "Present simple",
  objective: "Use present simple",
  contentVersion: 3,
  preparation: "ready",
  currentPage,
  messages: [],
  steps: [],
  questions: [],
  material: [page(0), page(1, { vocab: { term: "commute", meaning: "the trip to work" } })],
  quiz,
  ...over,
});
const roundItem = (index, prompt, result) => ({
  index,
  page: null,
  round: 1,
  questionData: { block: "fillGap", prompt },
  ...(result && { result }),
});
const quizDone = [item(0, fillGap, wrong), item(1, choice, right)];
const lessons = {
  lastPage: lesson("lastPage", 1, [item(0, fillGap), item(1, choice)]),
  asking: lesson("asking", 2, [item(0, fillGap, wrong), item(1, choice)]),
  writing: lesson("writing", 2, [], {
    material: [page(0, { question: "pending" }), page(1, { question: "pending" })],
  }),
  results: lesson("results", 2, [item(0, fillGap, wrong), item(1, choice, right)]),
  // Left at the choice after stepping back to a Page: the Learner comes back to the results and choice.
  writingRound: lesson("writingRound", 2, quizDone, { practice: "preparing" }),
  roundFailed: lesson("roundFailed", 2, quizDone, { practice: "failed" }),
  inRound: lesson("inRound", 2, [...quizDone, roundItem(2, "He ___ home."), roundItem(3, "They ___ late.")]),
  roundDone: lesson("roundDone", 2, [
    ...quizDone,
    roundItem(2, "He ___ home.", { ...wrong, answer: "go" }),
    roundItem(3, "They ___ late.", { ...wrong, answer: "works", correctAnswer: "work" }),
  ]),
  leftAtChoice: lesson("leftAtChoice", 0, [item(0, fillGap, wrong), item(1, choice, right)]),
};

let web;
before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (!/learner=/.test(req.headers.cookie ?? "")) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha" });
    if (req.url === "/api/progress") return json(200, { xp: 340, streak: 12 });
    if (req.url === "/api/roadmap") return json(200, []);
    const id = /^\/api\/lessons\/(\w+)$/.exec(req.url)?.[1];
    if (id && lessons[id]) return json(200, lessons[id]);
    json(404, { error: "Not found" });
  });
});
after(() => web.close());

async function open(path) {
  const response = await fetch(web.url + path, { headers: { cookie: "learner=asha" }, redirect: "manual" });
  assert.equal(response.status, 200, path);
  return (await response.text()).match(/<main[\s\S]*<\/main>/)[0];
}
const buttons = (html) => [...html.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((m) => text(m[0]));

test("a new Lesson's Pages only teach, with a vocab card, and the last Page leads to the Quiz", async () => {
  const html = await open("/lessons/lastPage");
  const t = text(html);
  assert.match(t, /Idea 2/);
  assert.match(t, /commute/);
  assert.match(t, /the trip to work/);
  assert.doesNotMatch(t, /She ___ to work/);
  assert.ok(buttons(html).includes("Start the Quiz"));
  assert.ok(!buttons(html).includes("Check answer"));
});

test("the Quiz asks one question at a time and holds its feedback back", async () => {
  const t = text(await open("/lessons/asking"));
  assert.match(t, /Question 2 of 2/);
  assert.match(t, /Which is right\?/);
  assert.doesNotMatch(t, /She ___ to work/);
  assert.doesNotMatch(t, /Incorrect|Correct answer|Add -es/);
});

test("a Quiz still being written shows a placeholder", async () => {
  const html = await open("/lessons/writing");
  assert.match(html, /aria-label="Getting your Quiz ready"/);
});

test("after the last answer one results screen shows every question, answer, verdict, correct answer and why", async () => {
  const html = await open("/lessons/results");
  const t = text(html);
  assert.match(t, /Quiz results/);
  assert.match(t, /1 of 2 right/);
  assert.match(t, /She ___ to work/);
  assert.match(t, /Which is right\?/);
  assert.match(t, /Incorrect/);
  assert.match(t, /Correct answer: goes/);
  assert.match(t, /Add -es\./);
  assert.match(t, /Agreement\./);
  assert.match(t, /What(&#x27;|')s next\?/);
  assert.ok(buttons(html).includes("Next lesson"));
  assert.ok(!buttons(html).includes("Finish Lesson"));
});

test("re-opening a Lesson whose Quiz is done lands on the results and choice", async () => {
  const html = await open("/lessons/leftAtChoice");
  assert.match(text(html), /Quiz results/);
  assert.ok(buttons(html).includes("Next lesson"));
});

test("the choice offers Practice more", async () => {
  assert.ok(buttons(await open("/lessons/results")).includes("Practice more"));
});

test("a Practice Round being written shows a placeholder", async () => {
  const html = await open("/lessons/writingRound");
  assert.match(html, /aria-label="Writing your Practice Round"/);
});

test("a Practice Round that couldn't be written can be tried again from the choice", async () => {
  const html = await open("/lessons/roundFailed");
  assert.match(text(html), /Your Practice Round couldn(&#x27;|')t be written/);
  assert.ok(buttons(html).includes("Try again"));
  assert.ok(buttons(html).includes("Next lesson"));
});

test("a Practice Round is answered like the Quiz, one question at a time", async () => {
  const t = text(await open("/lessons/inRound"));
  assert.match(t, /Practice Round 1/);
  assert.match(t, /Question 1 of 2/);
  assert.match(t, /He ___ home\./);
  assert.doesNotMatch(t, /Quiz results/);
});

test("each Practice Round has its own results, then the choice again", async () => {
  const html = await open("/lessons/roundDone");
  const t = text(html);
  assert.match(t, /Practice Round 1 results/);
  assert.match(t, /0 of 2 right/);
  assert.match(t, /They ___ late\./);
  assert.match(t, /Correct answer: work/);
  assert.doesNotMatch(t, /Which is right\?/);
  assert.ok(buttons(html).includes("Practice more"));
  assert.ok(buttons(html).includes("Next lesson"));
});

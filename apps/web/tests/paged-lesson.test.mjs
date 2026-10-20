import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startWeb, text } from "./helpers.mjs";

const ready = (n, over = {}) => ({
  page: n,
  status: "ready",
  question: "ready",
  title: `Idea ${n + 1}`,
  body: `Reading ${n + 1}.`,
  example: null,
  block: "reading",
  ...over,
});
const fillGap = (n, over = {}) =>
  ready(n, { block: "fillGap", questionData: { block: "fillGap", prompt: "She ___ to work." }, ...over });
const answered = {
  block: "fillGap",
  answer: "go",
  verdict: "incorrect",
  correctAnswer: "goes",
  explanation: "Add -es for she.",
};

const lesson = (id, currentPage, material, over = {}) => ({
  id,
  unitId: "u1",
  kind: "practice",
  status: "in_progress",
  title: "Present simple",
  objective: "Use present simple",
  contentVersion: 2,
  preparation: "ready",
  currentPage,
  messages: [],
  steps: [],
  questions: [],
  material,
  ...over,
});
const lessons = {
  first: lesson("first", 0, [ready(0), fillGap(1), ready(2)]),
  // Reloaded on Page 2, which was already answered.
  resumed: lesson("resumed", 1, [ready(0), fillGap(1, { result: answered }), ready(2)]),
  waiting: lesson("waiting", 1, [ready(0), fillGap(1, { question: "pending", questionData: undefined }), ready(2)]),
  broken: lesson("broken", 1, [ready(0), { page: 1, status: "failed", question: "pending" }, ready(2)]),
  recap: lesson("recap", 3, [ready(0), fillGap(1, { result: answered }), ready(2)]),
  done: lesson("done", 3, [ready(0), fillGap(1, { result: answered }), ready(2)], { status: "completed" }),
  // A vocabulary card always "passes", so it must not count towards the score.
  doneVocab: lesson(
    "doneVocab",
    3,
    [
      ready(0, {
        block: "vocabCard",
        questionData: { block: "vocabCard", term: "commute" },
        result: { block: "vocabCard", verdict: "correct" },
      }),
      fillGap(1, { result: answered }),
    ],
    { status: "completed" },
  ),
  oldPlayer: lesson("oldPlayer", 0, [], { contentVersion: 1, phase: "learning" }),
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

async function page(path) {
  const response = await fetch(web.url + path, { headers: { cookie: "learner=asha" }, redirect: "manual" });
  assert.equal(response.status, 200, path);
  return (await response.text()).match(/<main[\s\S]*<\/main>/)[0];
}
const button = (html, label) =>
  [...html.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((m) => m[0]).find((b) => text(b) === label);
const disabled = (b) => /\sdisabled(=|\s|>)/.test(b.match(/^<button[^>]*>/)[0]);

test("a paged Lesson opens on its first Page with progress dots and Back disabled", async () => {
  const html = await page("/lessons/first");
  const t = text(html);
  assert.match(t, /Idea 1/);
  assert.match(t, /Reading 1\./);
  assert.match(html, /aria-label="Page 1 of 4"/);
  assert.ok(disabled(button(html, "Back")));
  assert.ok(!disabled(button(html, "Next")));
});

test("a reloaded Lesson resumes on the saved Page and shows its saved result and explanation", async () => {
  const t = text(await page("/lessons/resumed"));
  assert.match(t, /Idea 2/);
  assert.match(t, /Incorrect/);
  assert.match(t, /Correct answer: goes/);
  assert.match(t, /Add -es for she\./);
  assert.doesNotMatch(t, /Idea 1/);
});

test("a question still being written shows a short placeholder and holds Next back", async () => {
  const html = await page("/lessons/waiting");
  assert.match(html, /aria-label="Getting your question ready"/);
  assert.ok(disabled(button(html, "Next")));
  assert.doesNotMatch(text(html), /She ___ to work/);
});

test("a Page that couldn't be written offers a retry", async () => {
  const t = text(await page("/lessons/broken"));
  assert.match(t, /This page couldn(&#x27;|')t be written\./);
  assert.match(t, /Try again/);
});

test("after the last Page the recap ends the Lesson with a Finish button", async () => {
  const t = text(await page("/lessons/recap"));
  assert.match(t, /Nice work/);
  assert.match(t, /0 of 1 checked questions right/);
  assert.match(t, /Finish Lesson/);
});

test("a Lesson prepared in the old format keeps the old player", async () => {
  const t = text(await page("/lessons/oldPlayer"));
  assert.match(t, /Start assessment/);
});

test("a finished paged Lesson shows its score and XP, with no Lesson Report", async () => {
  const t = text(await page("/lessons/done"));
  assert.match(t, /Lesson complete/);
  assert.match(t, /\+30 XP/);
  assert.match(t, /0 of 1 checked questions right/);
  assert.doesNotMatch(t, /Report/);
});

test("vocabulary cards don't count towards the score", async () => {
  const t = text(await page("/lessons/doneVocab"));
  assert.match(t, /0 of 1 checked questions right/);
});

test("a finished Lesson offers a Review button and no Finish button", async () => {
  const html = await page("/lessons/done");
  assert.ok(button(html, "Review this Lesson"));
  assert.ok(!button(html, "Finish Lesson"));
});

test("reviewing a finished Lesson shows the saved answer and explanation, with no way to submit or finish", async () => {
  const { PagedReview } = await web.loadModule("/src/components/lesson/PagedReview.tsx");
  const { createElement } = await import("react");
  const { renderToString } = await import("react-dom/server");
  const html = renderToString(
    createElement(PagedReview, { pages: [fillGap(0, { result: answered }), ready(1)], onClose() {} }),
  );
  const t = text(html);
  assert.match(t, /Incorrect/);
  assert.match(t, /Correct answer: goes/);
  assert.match(t, /Add -es for she\./);
  assert.ok(button(html, "Back to summary"));
  assert.ok(!button(html, "Check") && !button(html, "Check answer") && !button(html, "Finish Lesson"));
  assert.ok(disabled(button(html, "Back")));
});

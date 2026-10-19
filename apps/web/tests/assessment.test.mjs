import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buttons, linkTo, startWeb } from "./helpers.mjs";

// The Written Assessment, its Report and confirming Goals, rendered on the server against a stub API.
const startedAt = new Date().toISOString();
const coach = (id, text) => ({ id, role: "assistant", parts: [{ type: "text", text }] });
const learner = (id, text) => ({ id, role: "user", parts: [{ type: "text", text }] });

const report = {
  overallLevel: "B1",
  partial: false,
  skills: {
    fluency: null,
    grammar: { score: 58, level: "B1", evidence: [] },
    vocabulary: { score: 71, level: "B2", evidence: [] },
  },
  strengths: ["You explain your work clearly", "You use a good range of verbs", "Your tone is polite"],
  weaknesses: [
    {
      label: "Present perfect with since",
      kind: "grammar",
      quote: "I work here since 2020.",
      betterVersion: "I've worked here since 2020.",
    },
    { label: "Articles", kind: "grammar", quote: "I am nurse.", betterVersion: "I am a nurse." },
    {
      label: "Polite requests",
      kind: "phrase",
      quote: "Give me the file.",
      betterVersion: "Could you send me the file?",
    },
  ],
  proposedGoals: [],
  firstUnit: { title: "Tenses at work", objective: "Talk about your experience with the present perfect." },
};

const assessments = {
  fresh: { id: "fresh", mode: "written", status: "in_progress", startedAt, transcript: [] },
  chatting: {
    id: "chatting",
    mode: "written",
    status: "in_progress",
    startedAt,
    transcript: [
      learner("u1", "Hello"),
      coach("a1", "Hi! What do you do for work?"),
      learner("u2", "I am nurse in a big hospital."),
      {
        id: "a2",
        role: "assistant",
        parts: [
          { type: "text", text: "Thanks! Now a short one." },
          {
            type: "tool-fillGap",
            toolCallId: "c1",
            state: "output-available",
            input: { sentence: "She ___ to work by bus.", answer: "goes" },
            output: { answer: "go", grade: { correct: false, expected: "goes" } },
          },
          { type: "text", text: "And another." },
          {
            type: "tool-rewrite",
            toolCallId: "c2",
            state: "input-available",
            input: { sentence: "Give me the report.", aim: "Make it a polite request." },
          },
        ],
      },
    ],
  },
  short: { id: "short", mode: "written", status: "discarded", startedAt, transcript: [] },
  done: { id: "done", mode: "written", status: "completed", startedAt, transcript: [], report },
  left: {
    id: "left",
    mode: "written",
    status: "completed",
    startedAt,
    transcript: [],
    report: { ...report, partial: true },
  },
  voice: { id: "voice", mode: "voice", status: "in_progress", startedAt, transcript: [] },
};

const goals = [
  {
    id: "g1",
    kind: "job_interview",
    status: "proposed",
    targetLevels: { fluency: "B2", grammar: "B2", vocabulary: "C1" },
  },
  { id: "g2", kind: "general_fluency", status: "proposed", targetLevels: { grammar: "B1" } },
  { id: "g3", kind: "client_communication", status: "confirmed", targetLevels: {} },
];

let web;
let suggestionsAvailable = true;
let showSuggestions = true;
let preparation = { status: "ready", lesson: null };

before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (!/learner=/.test(req.headers.cookie ?? "")) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/assessments/preparation") return json(200, preparation);
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha" });
    if (req.url === "/api/goals")
      return suggestionsAvailable ? json(200, showSuggestions ? goals : []) : json(503, { error: "Unavailable" });
    const assessment = req.url.match(/^\/api\/assessments\/(\w+)$/);
    if (assessment)
      return assessments[assessment[1]]
        ? json(200, assessments[assessment[1]])
        : json(404, { error: "Assessment not found" });
    json(404, { error: "Not found" });
  });
});

after(() => web.close());

async function page(path) {
  const response = await fetch(web.url + path, { headers: { cookie: "learner=asha" }, redirect: "manual" });
  assert.equal(response.status, 200, path);
  return response.text();
}

// What the Learner reads: the body without scripts (which carry the loader data) or markup.
const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ");

test("a new Written Assessment shows the coach identity, a conversation composer and a way to finish", async () => {
  const html = await page("/assessments/fresh");
  assert.match(text(html), /Written Assessment/);
  assert.match(text(html), /Your conversation with Impromptu/);
  assert.doesNotMatch(text(html), /Say hello/);
  assert.match(html, /<label[^>]*>Your message to your coach<\/label>/);
  assert.ok(buttons(html).includes("Finish"));
});

test("a Written Assessment resumes from its transcript and shows the waiting item", async () => {
  const html = await page("/assessments/chatting");
  const shown = text(html);
  assert.match(shown, /Coach: Hi! What do you do for work\?/);
  assert.match(shown, /You: I am nurse in a big hospital\./);
  // The rewrite item waits for an answer, so the free-text box is hidden.
  assert.match(shown, /Make it a polite request\./);
  assert.match(shown, /Give me the report\./);
  assert.match(shown, /Your version/);
  assert.doesNotMatch(shown, /Your answer/);
  assert.match(html, /role="log"/);
});

test("an answered fillGap shows the Learner's answer but never its grade", async () => {
  const shown = text(await page("/assessments/chatting"));
  assert.match(shown, /She go to work by bus\./);
  assert.doesNotMatch(shown, /goes|correct|incorrect/i);
});

test("an attempt under 4 minutes says it was discarded and offers to start again", async () => {
  const html = await page("/assessments/short");
  assert.match(text(html), /Attempt discarded/);
  assert.match(text(html), /4 minutes/);
  assert.equal(text(linkTo(html, "/assessments/new")).trim(), "Start again");
});

test("a finished Assessment goes to its Report", async () => {
  const response = await fetch(`${web.url}/assessments/done`, {
    headers: { cookie: "learner=asha" },
    redirect: "manual",
  });
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), web.url).pathname, "/assessments/done/report");
});

test("a Voice Assessment opens a call with coach, captions, mute and end controls", async () => {
  const html = await page("/assessments/voice");
  const shown = text(html);
  assert.match(shown, /Connecting to your coach…/);
  assert.match(html, /<button[^>]*aria-label="Mute microphone"[^>]*aria-pressed="false"/);
  assert.match(text(html), /End conversation/);
  assert.doesNotMatch(shown, /coming soon/i);
});

test("the Report shows the overall level, each skill, strengths, weaknesses and the first Unit", async () => {
  const shown = text(await page("/assessments/done/report"));
  assert.match(shown, /B1/);
  assert.match(shown, /Grammar 58 · B1/);
  assert.match(shown, /Vocabulary 71 · B2/);
  assert.match(shown, /Fluency/);
  for (const strength of report.strengths) assert.match(shown, new RegExp(strength));
  for (const w of report.weaknesses) {
    assert.match(shown, new RegExp(w.label));
    assert.ok(shown.includes(w.quote) && shown.includes(w.betterVersion), w.label);
  }
  assert.match(shown, /Tenses at work/);
  assert.match(shown, /Talk about your experience with the present perfect\./);
  assert.doesNotMatch(shown, /partial/i);
});

test("a Report from leaving early is labelled partial", async () => {
  assert.match(text(await page("/assessments/left/report")), /partial/i);
});

test("the Report lets the Learner review suggested Goals and build a Roadmap in place", async () => {
  const html = await page("/assessments/done/report");
  assert.match(text(html), /Your coach’s suggestions/);
  assert.match(text(html), /Build my Roadmap/);
  assert.equal([...html.matchAll(/<main\b/g)].length, 1);
});

test("confirming Goals lists only proposed Goals, with editable Target Levels and one build action", async () => {
  const html = await page("/goals/confirm");
  const shown = text(html);
  assert.match(html, /Job Interview/);
  assert.match(html, /General Fluency/);
  assert.doesNotMatch(html, /Client Communication/);
  assert.match(shown, /Your Goal/);
  assert.match(text(html), /Build my Roadmap/);
  assert.equal(buttons(html).filter((label) => label === "Remove").length, 2);
  for (const level of ["B2", "C1"]) assert.match(shown, new RegExp(level));
});

test("the Report stays readable when Goal suggestions fail to load", async () => {
  suggestionsAvailable = false;
  try {
    const html = await page("/assessments/done/report");
    assert.match(text(html), /Your English level/);
    assert.match(text(html), /Goal suggestions couldn’t be loaded/);
    assert.match(html, /href="\/goals\/confirm"/);
  } finally {
    suggestionsAvailable = true;
  }
});

test("the Report opens the Roadmap directly when no proposed Goals remain", async () => {
  showSuggestions = false;
  try {
    assert.equal(text(linkTo(await page("/assessments/done/report"), "/roadmap")).trim(), "See my Roadmap");
  } finally {
    showSuggestions = true;
  }
});

test("Report stays readable while practice is pending, preparing or failed, then offers the ready Lesson", async () => {
  showSuggestions = false;
  try {
    for (const status of ["pending", "preparing"]) {
      preparation = { status, lesson: null };
      const html = await page("/assessments/done/report");
      assert.match(text(html), /Your English level/);
      assert.match(text(html), /Preparing your first Lesson/);
      assert.equal(linkTo(html, "/lessons/first"), undefined);
    }
    preparation = { status: "failed", lesson: null };
    const failed = await page("/assessments/done/report");
    assert.match(text(failed), /Your English level/);
    assert.match(text(failed), /We couldn.t prepare your practice/);
    assert.ok(buttons(failed).includes("Retry preparation"));
    preparation = { status: "ready", lesson: { id: "first", kind: "practice", title: "Talking about projects" } };
    const ready = await page("/assessments/done/report");
    assert.equal(text(linkTo(ready, "/lessons/first")).trim(), "Start Talking about projects");
    assert.doesNotMatch(text(ready), /Preparing your first Lesson/);
  } finally {
    showSuggestions = true;
    preparation = { status: "ready", lesson: null };
  }
});

test("practice polling repeats every three seconds only while work remains unfinished", async () => {
  const { practicePreparationQuery } = await web.loadModule("/src/lib/practice-preparation.ts");
  for (const status of ["pending", "preparing"]) {
    assert.equal(practicePreparationQuery.refetchInterval({ state: { status: "success", data: { status } } }), 3000);
  }
  for (const status of ["ready", "failed", "not_ready", undefined]) {
    assert.equal(practicePreparationQuery.refetchInterval({ state: { status: "success", data: { status } } }), false);
  }
  assert.equal(
    practicePreparationQuery.refetchInterval({ state: { status: "error", data: { status: "preparing" } } }),
    false,
  );
});

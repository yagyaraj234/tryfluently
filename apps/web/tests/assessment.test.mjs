import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startWeb } from "./helpers.mjs";

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
    { label: "Present perfect with since", kind: "grammar", quote: "I work here since 2020.", betterVersion: "I've worked here since 2020." },
    { label: "Articles", kind: "grammar", quote: "I am nurse.", betterVersion: "I am a nurse." },
    { label: "Polite requests", kind: "phrase", quote: "Give me the file.", betterVersion: "Could you send me the file?" },
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
  left: { id: "left", mode: "written", status: "completed", startedAt, transcript: [], report: { ...report, partial: true } },
  voice: { id: "voice", mode: "voice", status: "in_progress", startedAt, transcript: [] },
};

const goals = [
  { id: "g1", kind: "job_interview", status: "proposed", targetLevels: { fluency: "B2", grammar: "B2", vocabulary: "C1" } },
  { id: "g2", kind: "general_fluency", status: "proposed", targetLevels: { grammar: "B1" } },
  { id: "g3", kind: "client_communication", status: "confirmed", targetLevels: {} },
];

let web;

before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (!/learner=/.test(req.headers.cookie ?? "")) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha" });
    if (req.url === "/api/goals") return json(200, goals);
    const assessment = req.url.match(/^\/api\/assessments\/(\w+)$/);
    if (assessment) return assessments[assessment[1]] ? json(200, assessments[assessment[1]]) : json(404, { error: "Assessment not found" });
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

test("a new Written Assessment invites the Learner to say hello, with a box to answer and a way to finish", async () => {
  const html = await page("/assessments/fresh");
  assert.match(text(html), /Written Assessment/);
  assert.match(text(html), /Say hello/);
  assert.match(html, /<label[^>]*>Your answer<\/label>/);
  assert.match(html, /<button[^>]*>Finish<\/button>/);
});

test("a Written Assessment resumes from its transcript and shows the waiting item", async () => {
  const shown = text(await page("/assessments/chatting"));
  assert.match(shown, /Coach: Hi! What do you do for work\?/);
  assert.match(shown, /You: I am nurse in a big hospital\./);
  // The rewrite item waits for an answer, so the free-text box is hidden.
  assert.match(shown, /Make it a polite request\./);
  assert.match(shown, /Give me the report\./);
  assert.match(shown, /Your version/);
  assert.doesNotMatch(shown, /Your answer/);
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
  assert.match(html, /<a[^>]*href="\/assessments\/new"[^>]*>Start again<\/a>/);
});

test("a finished Assessment goes to its Report", async () => {
  const response = await fetch(`${web.url}/assessments/done`, { headers: { cookie: "learner=asha" }, redirect: "manual" });
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), web.url).pathname, "/assessments/done/report");
});

test("a Voice Assessment uses the same route and opens on the live bar, connecting, with mute and End", async () => {
  const html = await page("/assessments/voice");
  const shown = text(html);
  assert.match(shown, /Connecting… Voice Assessment/);
  assert.match(html, /<button[^>]*aria-label="Mute"[^>]*aria-pressed="false"/);
  assert.match(html, /<button[^>]*>End<\/button>/);
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

test("the Report continues onward", async () => {
  assert.match(await page("/assessments/done/report"), /<a[^>]*href="\/"[^>]*>Continue<\/a>/);
});

test("confirming Goals lists only proposed Goals, each with its Target Levels and a confirm and remove action", async () => {
  const html = await page("/goals/confirm");
  const shown = text(html);
  assert.match(shown, /Job Interview/);
  assert.match(shown, /General Fluency/);
  assert.doesNotMatch(shown, /Client Communication/);
  assert.equal(html.match(/>Confirm<\/button>/g)?.length, 2);
  assert.equal(html.match(/>Remove<\/button>/g)?.length, 2);
  for (const level of ["B2", "C1"]) assert.match(shown, new RegExp(level));
});

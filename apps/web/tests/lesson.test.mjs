import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { linkTo, startWeb } from "./helpers.mjs";

const user = (text) => ({ id: `u-${text}`, role: "user", parts: [{ type: "text", text }] });
const step = (type, input, state = "input-available", output) => ({
  type: `tool-${type}`,
  toolCallId: `c-${type}`,
  state,
  input,
  output,
});
const feedback = {
  type: "tool-giveFeedback",
  toolCallId: "c-fb",
  state: "output-available",
  input: { verdict: "almost", corrected: "x", explanation: "y" },
  output: { saved: true, verdict: "almost" },
};

const fillGap = { sentence: "They ___ football on Sundays.", answer: "play" };
const vocabCard = {
  word: "deadline",
  meaning: "the time by which something must be done",
  example: "The deadline is Friday.",
};
const speakPrompt = { question: "Tell me about the team you lead.", targetSeconds: 60 };
const rewrite = {
  sentence: "I am very very happy with the result.",
  aim: "Sound more natural by replacing 'very very'.",
};

const lesson = (id, over) => ({
  id,
  unitId: "u1",
  kind: "practice",
  status: "in_progress",
  title: "Present simple",
  objective: "Use present simple",
  messages: [],
  steps: [],
  ...over,
});
const lessons = {
  prepared: lesson("prepared", {
    preparation: "ready",
    phase: "learning",
    material: [{ title: "Habits", body: "Use present simple for routines.", example: "I walk daily." }],
    questions: [
      {
        id: "q1",
        type: "fillGap",
        input: { sentence: "She ___ daily.", choices: ["walk", "walks"] },
        answeredAt: null,
      },
    ],
  }),
  assessed: lesson("assessed", {
    preparation: "ready",
    status: "completed",
    phase: "assessment",
    material: [],
    questions: [],
    report: {
      summary: "Practise subject agreement.",
      objectiveProgress: 30,
      skills: { grammar: { score: 30, evidence: ["She walk"] } },
    },
  }),
  fresh: lesson("fresh"),
  // Resumed at its second Step: the first was answered and got feedback.
  resumed: lesson("resumed", {
    messages: [
      user("Let's start."),
      {
        id: "a1",
        role: "assistant",
        parts: [
          step("vocabCard", vocabCard, "output-available", { answer: "We met the deadline." }),
          feedback,
          step("fillGap", fillGap),
        ],
      },
    ],
  }),
  vocab: lesson("vocab", {
    messages: [user("Let's start."), { id: "a1", role: "assistant", parts: [step("vocabCard", vocabCard)] }],
  }),
  speak: lesson("speak", {
    messages: [user("Let's start."), { id: "a1", role: "assistant", parts: [step("speakPrompt", speakPrompt)] }],
  }),
  rewrite: lesson("rewrite", {
    messages: [user("Let's start."), { id: "a1", role: "assistant", parts: [step("rewrite", rewrite)] }],
  }),
  done: lesson("done", { status: "completed", steps: [{ answeredAt: "2026-10-18" }, { answeredAt: "2026-10-18" }] }),
  abandoned: lesson("abandoned", { status: "abandoned" }),
  roleplay: lesson("roleplay", { kind: "roleplay", roleplayKind: "mock_interview", tone: "standard" }),
};

let web;

before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (!/learner=/.test(req.headers.cookie ?? "")) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/voice-minutes")
      return json(200, {
        limitMinutes: 10,
        usedSeconds: 0,
        remainingSeconds: 600,
        resetsAt: "2026-11-01T00:00:00.000Z",
        callEndsAt: null,
      });
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha" });
    if (req.url === "/api/progress") return json(200, { xp: 340, streak: 12 });
    if (req.url === "/api/roadmap")
      return json(200, [
        {
          id: "u1",
          status: /finished=yes/.test(req.headers.cookie ?? "") ? "mastered" : "active",
          title: "Tenses for projects",
          lessons: [],
        },
      ]);
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

const text = (html) =>
  html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

test("a new Lesson waits while its first Step is prepared", async () => {
  const html = await page("/lessons/fresh");
  assert.match(html, /role="status"/);
  assert.match(text(html), /Preparing your first Step/);
});

test("a resumed Lesson restores the last submitted feedback before continuing", async () => {
  const t = text(await page("/lessons/resumed"));
  assert.match(t, /Almost/);
  assert.match(t, /We met the deadline/);
  assert.match(t, /Continue/);
});

test("a vocabCard Step shows the word, meaning and example, and asks for the Learner's sentence", async () => {
  const html = await page("/lessons/vocab");
  const t = text(html);
  assert.match(t, /New word · Step 1 of ~5/);
  assert.match(html, /<h3[^>]*>deadline<\/h3>/);
  assert.match(t, /the time by which something must be done/);
  assert.match(t, /Your sentence/);
});

test("a vocabCard Step can play the word's Reference Pronunciation and be recorded instead", async () => {
  const t = text(await page("/lessons/vocab"));
  assert.match(t, /Hear it/);
  assert.match(t, /Record instead/);
});

test("a speakPrompt Step is answered by recording, with the target length and Type instead", async () => {
  const html = await page("/lessons/speak");
  const t = text(html);
  assert.match(t, /Speak · Step 1 of ~5/);
  assert.match(html, /<h2[^>]*>Tell me about the team you lead\.<\/h2>/);
  assert.match(t, /Aim for about 60 seconds/);
  assert.match(html, /aria-label="Start recording"/);
  assert.match(t, /Type instead/);
  assert.doesNotMatch(t, /Your answer/, "the answer box waits for Type instead");
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
  assert.match(t, /\+40 XP/);
  // Next Lesson goes to the Roadmap, where the Learner picks it and presses Start; nothing is generated ahead.
  assert.match(text(linkTo(html, "/roadmap")), /Next Lesson/);
  assert.match(text(linkTo(html, "/home")), /Home/);
});

test("an abandoned Lesson offers Home without a completion reward", async () => {
  const t = text(await page("/lessons/abandoned"));
  assert.match(t, /This Lesson has ended/);
  assert.doesNotMatch(t, /Lesson complete|\+\d+ XP/);
});

test("a Roleplay Lesson opens on the Roleplay screen", async () => {
  const response = await get("/lessons/roleplay");
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), web.url).pathname, "/roleplays/roleplay");
  assert.match(text(await page("/roleplays/roleplay")), /Mock Interview · Standard/);
});

test("the top bar names the Unit the Lesson belongs to, next to the close link", async () => {
  const header = (await (await get("/lessons/resumed")).text()).match(/<header[\s\S]*?<\/header>/)[0];
  assert.match(header, /aria-label="Close"/);
  assert.match(text(header), /Tenses for projects/);
});

test("closing the Lesson goes back to Home", async () => {
  const response = await get("/lessons/vocab");
  assert.match(
    await response.text(),
    /<a\b[^>]*href="\/home"[^>]*aria-label="Close"|<a\b[^>]*aria-label="Close"[^>]*href="\/home"/,
  );
});

test("prepared Lesson shows saved learning material before assessment", async () => {
  const t = text(await page("/lessons/prepared"));
  assert.match(t, /Habits/);
  assert.match(t, /Use present simple for routines/);
  assert.match(t, /Start assessment/);
  assert.doesNotMatch(t, /Preparing your first Step/);
});

test("completed prepared Lesson reopens its saved report", async () => {
  const html = await page("/lessons/assessed");
  const t = text(html);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(t, /Lesson Report/);
  assert.match(t, /Practise subject agreement/);
  assert.match(t, /30/);
});

test("completed Roadmap offers review without another Lesson", async () => {
  const response = await fetch(web.url + "/lessons/assessed", { headers: { cookie: "learner=asha; finished=yes" } });
  const html = (await response.text()).match(/<main[\s\S]*<\/main>/)[0];
  assert.match(text(html), /Roadmap complete/);
  assert.doesNotMatch(text(html), /Next Lesson/);
});

test("legacy Lesson completion labels its missing detailed report", async () => {
  assert.match(text(await page("/lessons/done")), /No detailed report is available/);
});

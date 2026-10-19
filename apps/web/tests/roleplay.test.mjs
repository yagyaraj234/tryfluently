import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buttons, startWeb } from "./helpers.mjs";

const goal = (id, kind, status = "confirmed") => ({
  id,
  kind,
  status,
  targetLevels: {},
  brief: null,
  hasContext: false,
});
// Each Learner (by cookie) has their own Goals.
const goals = {
  asha: [goal("g1", "job_interview"), goal("g2", "general_fluency", "proposed")],
  ravi: [goal("g3", "general_fluency")],
  // Today's voice budget is used up, or nearly.
  zoe: [goal("g5", "job_interview")],
  kai: [goal("g6", "job_interview")],
  mei: [goal("g4", "client_communication", "proposed")],
};

const say = (role, text) => ({ id: `${role}-${text.length}`, role, parts: [{ type: "text", text }] });
const roleplay = (id, over) => ({
  id,
  kind: "roleplay",
  roleplayKind: "mock_interview",
  tone: "tough",
  textMode: true,
  status: "in_progress",
  unitId: null,
  title: "Mock Interview",
  objective: "Answer Mock Interview questions",
  messages: [],
  steps: [],
  debrief: null,
  ...over,
});
const debrief = {
  textMode: true,
  overallImpression: "You kept the conversation going and explained your project clearly.",
  questions: [
    {
      question: "Tell me about yourself.",
      quote: "I am working here since 2020.",
      strongerPhrasing: "I've been working here since 2020.",
      languageIssues: ["Present perfect continuous with since"],
    },
  ],
  phrasesToLearn: ["walk you through", "on the same page", "a quick win"],
  skillChanges: { grammar: { from: 54, to: 58 } },
};
const roleplays = {
  fresh: roleplay("fresh", { roleplayKind: "client_call", tone: "friendly" }),
  custom: roleplay("custom", {
    roleplayKind: "custom",
    roleplayScenario: "I need to ask my landlord to fix the heating.",
    tone: "friendly",
    title: "Custom Roleplay",
  }),
  // A Unit-closing Roleplay from /api/lessons/next: voice until the Learner types.
  closing: roleplay("closing", { textMode: false, unitId: "u1" }),
  spoken: roleplay("spoken", { textMode: false, messages: [say("assistant", "Hi, thanks for joining.")] }),
  done: roleplay("done", {
    status: "completed",
    unitId: "u1",
    debrief,
    messages: [say("user", "I led the billing project.")],
  }),
  quiet: roleplay("quiet", { status: "abandoned" }),
  practice: { ...roleplay("practice"), kind: "practice" },
  typing: roleplay("typing", {
    messages: [say("user", "Hello!"), say("assistant", "Thanks for coming in. Tell me about yourself.")],
  }),
};

const minutesLeft = (learner) => {
  const remainingSeconds = { zoe: 0, kai: 45 }[learner] ?? 900;
  return { usedSeconds: 900 - remainingSeconds, remainingSeconds };
};

let web;

before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    const learner = /learner=(\w+)/.exec(req.headers.cookie ?? "")?.[1];
    if (!learner) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/me") return json(200, { id: learner, name: learner });
    if (req.url === "/api/roleplays")
      return json(200, [
        { ...roleplays.done, startedAt: "2026-10-19T09:00:00Z" },
        { ...roleplays.quiet, startedAt: "2026-10-18T09:00:00Z" },
      ]);
    if (req.url === "/api/goals") return json(200, goals[learner] ?? []);
    if (req.url === "/api/voice-minutes") return json(200, { limitMinutes: 15, ...minutesLeft(learner) });
    const id = /^\/api\/lessons\/(\w+)$/.exec(req.url)?.[1];
    if (id && roleplays[id]) return json(200, roleplays[id]);
    json(404, { error: "Not found" });
  });
});

after(() => web.close());

const get = (path, learner = "asha") =>
  fetch(web.url + path, { headers: { cookie: `learner=${learner}` }, redirect: "manual" });

async function page(path, learner) {
  const response = await get(path, learner);
  assert.equal(response.status, 200, path);
  return (await response.text()).match(/<main[\s\S]*<\/main>/)[0];
}

const text = (html) =>
  html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

test("Roleplay setup offers six situations, a free-text situation, the tone and voice or text", async () => {
  const html = await page("/roleplays/new");
  const t = text(html);
  assert.match(t, /Job Interview/);
  assert.doesNotMatch(t, /General Fluency/, "only confirmed Goals");
  for (const situation of ["Mock Interview", "Client Call", "Presentation", "Team Meeting", "Phone Call", "Small Talk"]) {
    assert.match(t, new RegExp(situation));
  }
  assert.match(t, /Or describe your own situation/);
  assert.match(html, /<textarea/);
  for (const tone of ["Friendly", "Standard", "Tough"]) assert.match(t, new RegExp(tone));
  assert.match(t, /Speak/);
  assert.match(t, /Type/);
  // A Job Interview Goal starts on a Mock Interview, but the Learner can pick another situation.
  assert.match(t, /Start the Mock Interview/);
});

test("a General Fluency Goal shows every situation but starts with none selected", async () => {
  const t = text(await page("/roleplays/new", "ravi"));
  for (const situation of ["Mock Interview", "Client Call", "Presentation", "Team Meeting", "Phone Call", "Small Talk"]) {
    assert.match(t, new RegExp(situation));
  }
  assert.doesNotMatch(t, /Start the Mock Interview/);
  assert.match(t, /Start the Roleplay/);
});

test("without a confirmed Goal, Roleplay setup sends the Learner to set one", async () => {
  const html = await page("/roleplays/new", "mei");
  assert.match(text(html), /Confirm a Goal first/);
  assert.match(html, /href="\/goals/);
});

test("a text Roleplay is a chat with the character, with its kind, tone and an End button", async () => {
  const html = await page("/roleplays/typing");
  const t = text(html);
  assert.match(t, /Mock Interview · Tough/);
  assert.match(t, /You: Hello!/);
  assert.match(t, /Interviewer: Thanks for coming in\. Tell me about yourself\./);
  assert.ok(buttons(html).includes("End"));
  assert.match(html, /<textarea/);
  assert.match(html, /role="log"/);
});

test("a custom Roleplay shows its situation and counterpart", async () => {
  const t = text(await page("/roleplays/custom"));
  assert.match(t, /Custom Roleplay · Friendly/);
  assert.match(t, /I need to ask my landlord to fix the heating\./);
  assert.match(t, /Your counterpart stays in character/);
});

test("a new text Roleplay waits for the Learner to say hello", async () => {
  const t = text(await page("/roleplays/fresh"));
  assert.match(t, /Client Call · Friendly/);
  assert.match(t, /Say hello to start\. Your client stays in character/);
});

test("Type instead isn't offered while a call is connecting or live, since it can't be taken back", async () => {
  assert.doesNotMatch(text(await page("/roleplays/closing")), /Type instead/);
});

test("a finished Roleplay shows its Debrief, and one that closed a Unit goes on to the next Lesson", async () => {
  const t = text(await page("/roleplays/done"));
  assert.match(t, /Your Debrief/);
  assert.match(t, /You kept the conversation going/);
  assert.match(
    t,
    /Tell me about yourself\. You said I am working here since 2020\. Stronger I&#x27;ve been working here since 2020\./,
  );
  assert.match(t, /Present perfect continuous with since/);
  assert.match(t, /walk you through Hear it/);
  assert.match(t, /Grammar 54 → 58/);
  assert.match(t, /Next Lesson/);
});

test("a Roleplay ended before the Learner said anything shows as abandoned", async () => {
  assert.match(text(await page("/roleplays/quiet")), /Roleplay abandoned/);
});

test("a missing Roleplay, or a Lesson that isn't one, isn't found", async () => {
  assert.match(text(await page("/roleplays/nope")), /We couldn&#x27;t find that Roleplay/);
  assert.match(text(await page("/roleplays/practice")), /We couldn&#x27;t find that Roleplay/);
});

test("a voice Roleplay opens on the live bar, connecting, with its kind and tone, today's minutes left, mute and End", async () => {
  const html = await page("/roleplays/closing");
  const t = text(html);
  assert.match(t, /Connecting… Mock Interview · Tough/);
  assert.match(t, /15:00 left today/);
  assert.match(html, /aria-label="Mute"/);
  assert.ok(buttons(html).includes("End"));
});

test("with today's voice minutes used up, a voice Roleplay shows the cap and when it resets, and offers to type instead", async () => {
  const t = text(await page("/roleplays/closing", "zoe"));
  assert.match(t, /You&#x27;ve used today&#x27;s voice minutes/);
  assert.match(t, /15 minutes a day/);
  assert.match(t, /available at midnight/);
  assert.match(t, /Type instead/);
  assert.doesNotMatch(t, /Connecting/, "no call is started");
});

test("a Roleplay already spoken in, capped, can be ended for its Debrief", async () => {
  const t = text(await page("/roleplays/spoken", "zoe"));
  assert.match(t, /You&#x27;ve used today&#x27;s voice minutes/);
  assert.doesNotMatch(t, /Type instead/);
  assert.match(t, /Get my Debrief/);
});

test("in the last minute of today's voice minutes, a gentle warning says the call will wrap up", async () => {
  const t = text(await page("/roleplays/closing", "kai"));
  assert.match(t, /0:45 left today/);
  assert.match(t, /About a minute of voice time is left today/);
  assert.doesNotMatch(text(await page("/roleplays/closing")), /About a minute/, "not before the last minute");
});

test("Roleplays page lists saved sessions with feedback and abandoned status", async () => {
  const html = await page("/roleplays");
  assert.match(text(html), /Mock Interview/);
  assert.match(text(html), /Abandoned/);
  assert.match(html, /href="\/roleplays\/done"/);
  assert.match(text(html), /View feedback/);
  assert.match(html, /href="\/roleplays\/new"/);
});

test("saved Roleplay feedback includes its conversation history", async () => {
  const html = await page("/roleplays/done");
  assert.match(text(html), /Conversation history/);
  assert.match(text(html), /I led the billing project/);
  assert.match(html, /href="\/roleplays"/);
});

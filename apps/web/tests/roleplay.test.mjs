import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startWeb } from "./helpers.mjs";

const goal = (id, kind, status = "confirmed") => ({ id, kind, status, targetLevels: {}, brief: null, hasContext: false });
// Each Learner (by cookie) has their own Goals.
const goals = {
  asha: [goal("g1", "job_interview"), goal("g2", "general_fluency", "proposed")],
  ravi: [goal("g3", "general_fluency")],
  mei: [goal("g4", "client_communication", "proposed")],
};

const say = (role, text) => ({ id: `${role}-${text.length}`, role, parts: [{ type: "text", text }] });
const roleplay = (id, over) => ({
  id, kind: "roleplay", roleplayKind: "mock_interview", tone: "tough", textMode: true, status: "in_progress",
  unitId: null, title: "Mock Interview", objective: "Answer Mock Interview questions", messages: [], steps: [], debrief: null, ...over,
});
const debrief = {
  textMode: true,
  overallImpression: "You kept the conversation going and explained your project clearly.",
  questions: [{ question: "Tell me about yourself.", quote: "I am working here since 2020.", strongerPhrasing: "I've been working here since 2020.", languageIssues: ["Present perfect continuous with since"] }],
  phrasesToLearn: ["walk you through", "on the same page", "a quick win"],
  skillChanges: { grammar: { from: 54, to: 58 } },
};
const roleplays = {
  fresh: roleplay("fresh", { roleplayKind: "client_call", tone: "friendly" }),
  // A Unit-closing Roleplay from /api/lessons/next: voice until the Learner types.
  closing: roleplay("closing", { textMode: false, unitId: "u1" }),
  spoken: roleplay("spoken", { textMode: false, messages: [say("assistant", "Hi, thanks for joining.")] }),
  done: roleplay("done", { status: "completed", unitId: "u1", debrief }),
  quiet: roleplay("quiet", { status: "abandoned" }),
  practice: { ...roleplay("practice"), kind: "practice" },
  typing: roleplay("typing", { messages: [say("user", "Hello!"), say("assistant", "Thanks for coming in. Tell me about yourself.")] }),
};

let web;

before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    const learner = /learner=(\w+)/.exec(req.headers.cookie ?? "")?.[1];
    if (!learner) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/me") return json(200, { id: learner, name: learner });
    if (req.url === "/api/goals") return json(200, goals[learner] ?? []);
    const id = /^\/api\/lessons\/(\w+)$/.exec(req.url)?.[1];
    if (id && roleplays[id]) return json(200, roleplays[id]);
    json(404, { error: "Not found" });
  });
});

after(() => web.close());

const get = (path, learner = "asha") => fetch(web.url + path, { headers: { cookie: `learner=${learner}` }, redirect: "manual" });

async function page(path, learner) {
  const response = await get(path, learner);
  assert.equal(response.status, 200, path);
  return (await response.text()).match(/<main[\s\S]*<\/main>/)[0];
}

const text = (html) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("Roleplay setup offers the confirmed Goals, the tone and voice or text", async () => {
  const t = text(await page("/roleplays/new"));
  assert.match(t, /Job Interview/);
  assert.doesNotMatch(t, /General Fluency/, "only confirmed Goals");
  for (const tone of ["Friendly", "Standard", "Tough"]) assert.match(t, new RegExp(tone));
  assert.match(t, /Speak/);
  assert.match(t, /Type/);
  // A Job Interview Goal is always a Mock Interview, so there's nothing to choose.
  assert.doesNotMatch(t, /Client Call/);
  assert.match(t, /Start the Mock Interview/);
});

test("for General Fluency the Learner chooses a Mock Interview or a Client Call", async () => {
  const t = text(await page("/roleplays/new", "ravi"));
  assert.match(t, /Mock Interview/);
  assert.match(t, /Client Call/);
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
  assert.match(html, /<button[^>]*>End<\/button>/);
  assert.match(html, /<textarea/);
});

test("a new text Roleplay waits for the Learner to say hello", async () => {
  const t = text(await page("/roleplays/fresh"));
  assert.match(t, /Client Call · Friendly/);
  assert.match(t, /Your client is ready .* Say hello to start\./);
});

test("a Roleplay not spoken in yet can be typed instead; one already spoken can't", async () => {
  assert.match(text(await page("/roleplays/closing")), /Type instead/);
  assert.doesNotMatch(text(await page("/roleplays/spoken")), /Type instead/);
});

test("a finished Roleplay shows its Debrief, and one that closed a Unit goes on to the next Lesson", async () => {
  const t = text(await page("/roleplays/done"));
  assert.match(t, /Your Debrief/);
  assert.match(t, /You kept the conversation going/);
  assert.match(t, /Tell me about yourself\. You said I am working here since 2020\. Stronger I&#x27;ve been working here since 2020\./);
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

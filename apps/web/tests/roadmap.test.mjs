import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startWeb } from "./helpers.mjs";

const lesson = (over) => ({ kind: "practice", status: "completed", objectiveProgress: 70, ...over });
const unit = (id, status, over = {}) => ({
  id,
  status,
  position: Number(id) - 1,
  title: `Unit ${id}`,
  objective: `Objective of Unit ${id}`,
  skills: ["grammar"],
  endsWithRoleplay: false,
  lessons: [],
  ...over,
});

// The `roadmap` cookie picks the Learner's Roadmap: one in progress (the default), a fresh one, or none at all.
const roadmaps = {
  inProgress: [
    unit("1", "mastered", { lessons: [lesson({ id: "l1", title: "Past simple", objectiveProgress: 85 })] }),
    unit("2", "skipped"),
    unit("3", "active", {
      title: "Tenses for projects",
      objective: "Talk about past projects with the right tense",
      skills: ["grammar", "fluency"],
      endsWithRoleplay: true,
      lessons: [
        lesson({ id: "l2", position: 0, title: "Present perfect with since", objectiveProgress: 64 }),
        lesson({ id: "l3", position: 1, title: "Talking about results", status: "in_progress", objectiveProgress: null }),
      ],
    }),
    unit("4", "planned"),
  ],
  fresh: [unit("1", "active"), unit("2", "planned")],
  none: [],
};

let web;

before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (!/learner=/.test(req.headers.cookie ?? "")) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha" });
    if (req.url === "/api/goals") return json(200, [{ status: "confirmed" }]);
    if (req.url === "/api/assessments") return json(200, [{ status: "completed" }]);
    if (req.url === "/api/progress") return json(200, { xp: 340, streak: 12 });
    if (req.url === "/api/roadmap") return json(200, roadmaps[/roadmap=(\w+)/.exec(req.headers.cookie)?.[1] ?? "inProgress"]);
    json(404, { error: "Not found" });
  });
});

after(() => web.close());

async function page(path, roadmap = "inProgress") {
  const response = await fetch(web.url + path, { headers: { cookie: `learner=asha; roadmap=${roadmap}` } });
  assert.equal(response.status, 200, path);
  return (await response.text()).match(/<main[\s\S]*<\/main>/)[0];
}

const text = (html) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const buttons = (html) => [...html.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((m) => text(m[0]));
const linkTo = (html, href) => html.match(new RegExp(`<a\\b[^>]*href="${href}"[^>]*>[\\s\\S]*?</a>`))?.[0];

test("Home resumes the Lesson in progress, and shows the Streak, XP and the active Unit", async () => {
  const html = await page("/");
  assert.match(text(linkTo(html, "/lessons/l3")), /Resume/);
  assert.match(text(html), /Talking about results/);
  assert.match(text(html), /12 day streak/);
  assert.match(text(html), /340 XP/);
  assert.match(text(linkTo(html, "/roadmap/3")), /Tenses for projects.*Active/);
});

test("Home offers to start the next Lesson when none is in progress", async () => {
  const html = await page("/", "fresh");
  assert.ok(buttons(html).some((b) => /Start your next Lesson/.test(b)));
  assert.equal(linkTo(html, "/lessons/[^\"]+"), undefined);
});

test("Home offers a Roleplay any time", async () => {
  assert.match(text(linkTo(await page("/"), "/roleplays/new")), /Start a Roleplay/);
});

test("the Roadmap lists every Unit as a link, with its status as a word", async () => {
  const html = await page("/roadmap");
  const statuses = ["Mastered", "Skipped", "Active", "Planned"];
  for (const [i, status] of statuses.entries()) {
    assert.match(text(linkTo(html, `/roadmap/${i + 1}`)), new RegExp(status), status);
  }
});

test("a Unit shows its objective, skills, past Lessons with their objective progress, and its Roleplay", async () => {
  const html = await page("/roadmap/3");
  const t = text(html);
  assert.match(html, /<h1[^>]*>Tenses for projects<\/h1>/);
  assert.match(t, /Talk about past projects with the right tense/);
  assert.match(t, /Grammar.*Fluency/);
  assert.match(t, /Ends with a Roleplay/);
  assert.match(html, /<div[^>]*aria-valuenow="64"[^>]*role="meter"/);
  assert.match(t, /Present perfect with since/);
  assert.ok(buttons(html).some((b) => /Skip this Unit/.test(b)));
});

test("a finished Unit can't be skipped, and a Unit without a Roleplay says so", async () => {
  const html = await page("/roadmap/1");
  assert.doesNotMatch(html, /Skip this Unit/);
  assert.match(text(html), /No Roleplay/);
});

test("without a Roadmap, Home and the Roadmap offer to build it", async () => {
  for (const path of ["/", "/roadmap"]) {
    assert.ok(buttons(await page(path, "none")).some((b) => /Build my Roadmap/.test(b)), path);
  }
});

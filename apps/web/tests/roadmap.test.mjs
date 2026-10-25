import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buttons, linkTo, startWeb } from "./helpers.mjs";

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
  roleplayReady: false,
  lessonOutline: [
    {
      position: 0,
      kind: "practice",
      title: `Useful words for Unit ${id}`,
      objective: "Use precise words",
      skill: "vocabulary",
    },
    {
      position: 1,
      kind: "practice",
      title: `Clear sentences for Unit ${id}`,
      objective: "Express a clear thought",
      skill: "grammar",
    },
    {
      position: 2,
      kind: "practice",
      title: `Explain an idea in Unit ${id}`,
      objective: "Speak with confidence",
      skill: "fluency",
    },
  ],
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
        lesson({
          id: "l3",
          position: 1,
          title: "Talking about results",
          status: "in_progress",
          objectiveProgress: null,
        }),
      ],
    }),
    unit("4", "planned"),
  ],
  fresh: [unit("1", "active"), unit("2", "planned")],
  ready: [
    unit("1", "active", {
      endsWithRoleplay: true,
      roleplayReady: true,
      lessonOutline: [
        ...unit("1", "active").lessonOutline,
        {
          position: 3,
          kind: "roleplay",
          title: "A project handover call",
          objective: "Explain next steps",
          skill: "fluency",
        },
      ],
    }),
  ],
  none: [],
  preparing: [],
  preparingCurrent: [
    unit("1", "active", {
      lessons: [
        lesson({
          id: "preparing",
          title: "Next practice",
          position: 0,
          status: "in_progress",
          preparation: "preparing",
        }),
      ],
    }),
  ],
  quizDone: [
    unit("1", "active", {
      lessons: [
        lesson({
          id: "choosing",
          title: "Next practice",
          position: 0,
          status: "in_progress",
          preparation: "ready",
          contentVersion: 3,
          quizDone: true,
        }),
      ],
    }),
  ],
  expiredCurrent: [
    unit("1", "active", {
      lessons: [
        lesson({ id: "expired", title: "Next practice", position: 0, status: "in_progress", preparation: "preparing" }),
      ],
    }),
  ],
};

// Thursday: practised on Monday and Wednesday.
const week = ["12", "13", "14", "15", "16", "17", "18"].map((d) => ({
  day: `2026-10-${d}`,
  practised: d === "12" || d === "14",
  today: d === "15",
}));

let web;

before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (!/learner=/.test(req.headers.cookie ?? "")) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/assessments/preparation")
      return json(200, {
        status: /roadmap=(none|expiredCurrent)/.test(req.headers.cookie)
          ? "failed"
          : /roadmap=preparing/.test(req.headers.cookie)
            ? "pending"
            : "ready",
        lesson: null,
      });
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha" });
    if (req.url === "/api/goals") return json(200, [{ status: "confirmed" }]);
    if (req.url === "/api/assessments") return json(200, [{ status: "completed" }]);
    if (req.url === "/api/progress") return json(200, { xp: 340, streak: 12, week });
    if (req.url === "/api/skill-profile")
      return json(200, { fluency: null, grammar: { score: 58, level: "B2" }, vocabulary: { score: 40, level: "B1" } });
    if (req.url === "/api/roadmap")
      return json(200, roadmaps[/roadmap=(\w+)/.exec(req.headers.cookie)?.[1] ?? "inProgress"]);
    json(404, { error: "Not found" });
  });
});

after(() => web.close());

async function page(path, roadmap = "inProgress") {
  const response = await fetch(web.url + path, { headers: { cookie: `learner=asha; roadmap=${roadmap}` } });
  assert.equal(response.status, 200, path);
  return (await response.text()).match(/<main[\s\S]*<\/main>/)[0];
}

const text = (html) =>
  html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

test("Home resumes the Lesson in progress in the active Unit", async () => {
  const html = await page("/home");
  assert.match(text(linkTo(html, "/lessons/l3")), /Resume/);
  assert.match(text(html), /Talking about results/);
  assert.match(text(linkTo(html, "/roadmap/3")), /Tenses for projects/);
  assert.match(text(html), /Active/);
});

test("Home's Continue card shows completion of outlined Lessons", async () => {
  const t = text(await page("/home"));
  assert.match(t, /Continue learning.*Tenses for projects.*1 Lesson done.*33% completed.*Resume/);
});

test("Home's Up next links the planned Units after the active one, and leaves finished Units to the Roadmap", async () => {
  const html = await page("/home");
  assert.match(text(html), /Up next.*Planned.*Unit 4/);
  assert.ok(linkTo(html, "/roadmap/4"));
  assert.equal(linkTo(html, "/roadmap/1"), undefined);
  assert.equal(linkTo(html, "/roadmap/2"), undefined);
});

test("Home's profile card shows the Learner's name, the CEFR Level of each measured skill, and Streak, XP and Units mastered", async () => {
  const html = await page("/home");
  assert.match(text(html), /Asha.*Grammar B2.*Vocabulary B1.*12 Day streak.*340 XP.*1 Unit mastered/);
  assert.doesNotMatch(text(html), /Fluency [ABC]/);
  assert.match(text(linkTo(html, "/progress")), /Grammar B2/);
});

test("Home's week strip runs Monday to Sunday, marking the days practised and today", async () => {
  const t = text(await page("/home"));
  assert.match(t, /This week.*Mon 12 practised.*Tue 13.*Wed 14 practised.*Thu 15 today.*Fri 16.*Sat 17.*Sun 18/);
  assert.doesNotMatch(t, /Tue 13 practised/);
});

test("Home's stat tiles count the Lessons done across the Roadmap and the Units in progress", async () => {
  assert.match(text(await page("/home")), /This week.*2 Lessons done.*1 Unit in progress/);
});

test("Home offers to start the next Lesson when none is in progress", async () => {
  const html = await page("/home", "fresh");
  assert.match(text(linkTo(html, "/roadmap")), /Start your next Lesson/);
  assert.equal(linkTo(html, '/lessons/[^"]+'), undefined);
});

test("Home offers a Roleplay any time", async () => {
  assert.match(text(linkTo(await page("/home"), "/roleplays/new")), /Start a Roleplay/);
});

test("the Roadmap renders Unit headers, known Lessons and locked future Units", async () => {
  const html = await page("/roadmap");
  for (const status of ["Mastered", "Skipped", "Active", "Planned"]) assert.match(text(html), new RegExp(status));
  assert.match(text(html), /Present perfect with since/);
  assert.match(text(html), /Talking about results/);
  assert.match(text(html), /Useful words for Unit 4/);
  assert.match(text(html), /Clear sentences for Unit 4/);
  assert.match(text(html), /Explain an idea in Unit 4/);
  assert.match(linkTo(html, "/lessons/l2"), /aria-label="Review Present perfect with since"/);
  assert.match(linkTo(html, "/lessons/l3"), /aria-label="Open Talking about results"/);
  assert.doesNotMatch(text(html), /Resume Lesson|Personalised Lessons|Put it into practice|Lessons completed/);
  assert.doesNotMatch(text(html), /Step \d+ of \d+|\d+\/\d+ Lessons/);
});

test("a fresh Roadmap opens practice from its first circle and keeps future Lessons locked", async () => {
  const html = await page("/roadmap", "fresh");
  assert.match(html, /<button[^>]*aria-label="Open Useful words for Unit 1"/);
  assert.doesNotMatch(html, /aria-label="Open (?:Clear sentences for Unit 1|Useful words for Unit 2)"/);
  assert.doesNotMatch(text(html), /Resume|Start your next Lesson/);
});

test("a ready Roleplay uses its outlined title and replaces unused future practice", async () => {
  const html = await page("/roadmap", "ready");
  assert.match(html, /<button[^>]*aria-label="Open A project handover call"/);
  assert.doesNotMatch(text(html), /Useful words for Unit 1|Clear sentences for Unit 1|More practice/);
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
  assert.doesNotMatch(text(html), /Skip this Unit/);
});

test("the active Unit resumes its Lesson in progress, or starts its next one; other Units offer neither", async () => {
  assert.match(text(linkTo(await page("/roadmap/3"), "/lessons/l3")), /Resume/);
  assert.match(text(await page("/roadmap/1", "fresh")), /Start your next Lesson/);
  const planned = await page("/roadmap/4");
  assert.doesNotMatch(text(planned), /Resume|Start your next Lesson/);
});

test("a finished Unit can't be skipped, and a Unit without a Roleplay says so", async () => {
  const html = await page("/roadmap/1");
  assert.doesNotMatch(html, /Skip this Unit/);
  assert.match(text(html), /No Roleplay/);
});

test("failed preparation on Home and Roadmap offers retry", async () => {
  for (const path of ["/home", "/roadmap"]) {
    assert.ok(
      buttons(await page(path, "none")).some((b) => /Retry preparation/.test(b)),
      path,
    );
  }
});

test("Home and Roadmap show queued preparation instead of an unavailable Roadmap", async () => {
  for (const path of ["/home", "/roadmap"]) {
    const html = await page(path, "preparing");
    assert.match(html, /Preparing your first Lesson/);
    assert.doesNotMatch(html, /Your practice couldn.t be prepared/);
  }
});

test("Home waits for current Lesson preparation and offers recovery after its lease expires", async () => {
  const preparing = await page("/home", "preparingCurrent");
  assert.match(preparing, /Preparing your Lesson/);
  assert.ok(!buttons(preparing).some((label) => /Start your next Lesson/.test(label)));
  const expired = await page("/home", "expiredCurrent");
  assert.match(text(linkTo(expired, "/roadmap")), /Start your next Lesson/);
});

test("polling a paged Lesson stops once every Page is ready or failed, or the Lesson failed", async () => {
  const { pagesSettled } = await web.loadModule("/src/lib/lessons.ts");
  const pages = (...status) => ({ preparation: "preparing", pages: status.map((s) => ({ status: s })) });
  assert.equal(pagesSettled(undefined), false);
  assert.equal(pagesSettled(pages("ready", "pending")), false);
  assert.equal(pagesSettled(pages("ready", "ready")), true);
  assert.equal(pagesSettled(pages("ready", "failed")), true);
  assert.equal(pagesSettled({ ...pages("pending"), preparation: "failed" }), true);
});

test("a failed check on a paged Lesson slows the polling down instead of stopping it", async () => {
  const { lessonPagesQuery } = await web.loadModule("/src/lib/lessons.ts");
  const { refetchInterval } = lessonPagesQuery("lesson-1");
  const pending = { preparation: "preparing", pages: [{ status: "pending" }] };
  assert.equal(refetchInterval({ state: { status: "success", data: pending } }), 1500);
  assert.equal(refetchInterval({ state: { status: "error", data: pending } }), 5000);
  assert.equal(refetchInterval({ state: { status: "error", data: undefined } }), 5000);
  assert.equal(refetchInterval({ state: { status: "success", data: { ...pending, preparation: "failed" } } }), false);
});

test("Home puts learning before the supporting progress summary in reading order", async () => {
  const html = await page("/home");
  assert.ok(html.indexOf("Continue learning") < html.indexOf('aria-label="Your profile"'));
});

test("a Lesson whose Quiz is done waits on the Learner's choice on the Roadmap", async () => {
  const html = await page("/roadmap", "quizDone");
  assert.match(text(html), /Quiz done — choose what(&#x27;|')s next/);
  assert.doesNotMatch(text(html), /In progress/);
  assert.match(linkTo(html, "/lessons/choosing"), /Next practice/);
});

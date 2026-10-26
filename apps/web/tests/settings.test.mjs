import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buttons, startWeb, text } from "./helpers.mjs";

let web;

before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (!/learner=/.test(req.headers.cookie ?? "")) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/voice-minutes")
      return json(200, {
        limitMinutes: 10,
        usedSeconds: 120,
        remainingSeconds: 480,
        resetsAt: "2026-11-01T00:00:00.000Z",
        callEndsAt: null,
      });
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha", timezone: "America/New_York" });
    if (req.url === "/api/progress")
      return json(200, { xp: 340, streak: 12, week: [{ day: "2026-10-19", today: true, practised: true }] });
    if (req.url === "/api/skill-profile")
      return json(200, {
        fluency: { level: "A1" },
        grammar: { level: "B1" },
        vocabulary: { level: "B1" },
      });
    if (req.url === "/api/roadmap")
      return json(200, [
        { status: "mastered", lessons: [{ status: "completed" }] },
        { status: "active", lessons: [] },
      ]);
    json(404, { error: "Not found" });
  });
});

after(() => web.close());

async function page(cookie = "learner=asha") {
  const response = await fetch(web.url + "/profile", { headers: { cookie } });
  assert.equal(response.status, 200);
  return response.text();
}

const checkedTheme = (html) =>
  [...html.matchAll(/<[^>]*role="radio"[^>]*>[\s\S]*?(Light|Dark|System)/g)]
    .filter((m) => /aria-checked="true"/.test(m[0].match(/<[^>]*role="radio"[^>]*>/)[0]))
    .map((m) => m[1]);

test("Profile offers Light, Dark and System, with Light picked when no theme is set", async () => {
  const html = await page();
  assert.match(html, /<h1[^>]*>Profile<\/h1>/);
  assert.match(text(html), /Theme/);
  assert.deepEqual(checkedTheme(html), ["Light"]);
});

test("the theme from the cookie is picked, and applied to the page while server rendering", async () => {
  const html = await page("learner=asha; theme=dark");
  assert.deepEqual(checkedTheme(html), ["Dark"]);
  assert.match(html, /<html[^>]*data-theme="dark"/);
});

test("the timezone shows the Learner's saved zone", async () => {
  const body = text(await page());
  assert.match(body, /Timezone/);
  assert.match(body, /America\/New York/);
});

test("the Learner can sign out or delete their account", async () => {
  const html = await page();
  assert.ok(buttons(html).includes("Sign out"));
  assert.ok(buttons(html).includes("Delete your account"));
  for (const path of ["privacy", "terms", "contact"]) assert.match(html, new RegExp(`href="/${path}"`));
});

test("Profile includes the shared learning summary", async () => {
  const body = text(await page());
  for (const value of [
    "Asha",
    "Fluency A1",
    "Grammar B1",
    "Vocabulary B1",
    "12 Day streak",
    "340 XP",
    "1 Unit mastered",
    "This week",
    "1/7 days",
    "1 Lesson done",
    "1 Unit in progress",
  ]) {
    assert.ok(body.includes(value), value);
  }
});

test("old Settings links redirect to Profile", async () => {
  const response = await fetch(web.url + "/settings", { headers: { cookie: "learner=asha" }, redirect: "manual" });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/profile");
});

test("Profile shows Free plan, monthly allowance, renewal and beta email link", async () => {
  const html = await page();
  const body = text(html);
  assert.match(body, /Free plan/);
  assert.match(body, /8:00 of 10 minutes left this month/);
  assert.match(body, /Renews November 1, 2026 at 00:00 UTC/);
  assert.match(body, /beta/);
  assert.match(html, /href="mailto:hey@yagyaraj.com"/);
});

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startWeb } from "./helpers.mjs";

// Asha took a Written Assessment (no fluency yet) and some Lessons. `assessed=recently` locks the retake.
const day = 86_400_000;
const history = [
  {
    skill: "grammar",
    score: 50,
    level: "B1",
    source: "assessment",
    sourceId: "a1",
    createdAt: "2026-10-01T09:00:00.000Z",
  },
  {
    skill: "vocabulary",
    score: 40,
    level: "B1",
    source: "assessment",
    sourceId: "a1",
    createdAt: "2026-10-01T09:00:00.000Z",
  },
  { skill: "grammar", score: 58, level: "B2", source: "lesson", sourceId: "l1", createdAt: "2026-10-14T18:30:00.000Z" },
];
const focusItems = [
  { id: "f1", label: "in charge of", kind: "phrase", status: "closed", hits: 3 },
  { id: "f2", label: "Present perfect with since and for", kind: "grammar", status: "open", hits: 2 },
];

let web;

before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    const cookie = req.headers.cookie ?? "";
    if (!/learner=/.test(cookie)) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha", timezone: "Asia/Kolkata" });
    if (req.url === "/api/progress") return json(200, { xp: 340, streak: 12 });
    if (req.url === "/api/reports")
      return json(200, [
        { id: "l1", title: "Daily routines", kind: "lesson", at: "2026-10-19T09:00:00Z" },
        { id: "a1", title: "Written Assessment", kind: "assessment", at: "2026-10-01T09:00:00Z" },
      ]);
    if (req.url === "/api/skill-profile")
      return json(200, { fluency: null, grammar: { score: 58, level: "B2" }, vocabulary: { score: 40, level: "B1" } });
    if (req.url === "/api/skill-profile/history") return json(200, history);
    if (req.url === "/api/focus-items") return json(200, focusItems);
    if (req.url === "/api/assessments") {
      const endedAt = new Date(Date.now() - (/assessed=recently/.test(cookie) ? 2 : 10) * day).toISOString();
      return json(200, [{ id: "a1", status: "completed", endedAt }]);
    }
    json(404, { error: "Not found" });
  });
});

after(() => web.close());

async function page(path, cookie = "learner=asha") {
  const response = await fetch(web.url + path, { headers: { cookie } });
  assert.equal(response.status, 200, path);
  return response.text();
}

const meters = (html) =>
  (html.match(/<[^>]*role="meter"[^>]*>/g) ?? []).map((tag) => tag.match(/aria-valuetext="([^"]*)"/)[1]);
const text = (html) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "");

test("each measured skill shows its score and CEFR Level", async () => {
  const html = await page("/progress");
  assert.match(html, /<h1[^>]*>Progress<\/h1>/);
  assert.deepEqual(meters(html), ["58, B2", "40, B1"]);
  assert.match(html, /<li aria-current="true"[^>]*>B2<\/li>/);
});

test("a skill with no score yet gets an empty state instead of a bar", async () => {
  const html = await page("/progress");
  assert.equal(meters(html).length, 2);
  assert.match(text(html), /No fluency score yet/);
});

test("each skill's history lists its scores, newest first, dated in the Learner's timezone and marked by source", async () => {
  const html = await page("/progress");
  const grammar = html.match(/<table aria-label="Grammar history"[\s\S]*?<\/table>/)?.[0];
  assert.ok(grammar, "Grammar history table");
  const rows = [...grammar.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => text(m[1]));
  // 18:30 UTC on 14 Oct is past midnight in Kolkata.
  assert.deepEqual(rows, ["DateScoreFrom", "15 Oct 202658 · B2Lesson", "1 Oct 202650 · B1Assessment"]);
});

test("Focus Items list the open ones first, with their hits towards closing", async () => {
  const body = text(await page("/progress"));
  const open = body.indexOf("Present perfect with since and for");
  const closed = body.indexOf("in charge of");
  assert.ok(open > -1 && closed > open, "open before closed");
  assert.match(body, /2 of 3 correct uses to close it/);
  assert.match(body, /Closed/);
});

test("the Assessment can be retaken from Progress", async () => {
  const html = await page("/progress");
  const link = html.match(/<a[^>]*href="\/assessments\/new"[^>]*>[\s\S]*?<\/a>/)?.[0];
  assert.ok(link, "Assessment link");
  assert.equal(text(link), "Retake the Assessment");
  assert.doesNotMatch(text(html), /next Assessment opens/);
});

test("while the retake is locked, Progress shows when it opens", async () => {
  const body = text(await page("/progress", "learner=asha; assessed=recently"));
  const opens = new Date(Date.now() + 5 * day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  assert.match(body, new RegExp(`next Assessment opens on [A-Za-z]+,? ${opens}`));
});

test("overview summarises real changes and Focus Item status, with full history collapsed", async () => {
  const html = await page("/progress");
  assert.match(text(html), /\+8 points since first score/);
  assert.match(text(html), /1 open · 1 closed/);
  assert.match(html, /aria-label="Grammar scores, oldest to newest: 50, 58. Scale 0 to 100."/);
  assert.match(html, /<details[^>]*><summary[^>]*>Score history<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]* open/);
});

test("Progress links to saved Assessment and Lesson reports", async () => {
  const html = await page("/progress");
  assert.match(text(html), /Reports/);
  assert.match(html, /href="\/lessons\/l1"/);
  assert.match(html, /href="\/assessments\/a1\/report"/);
});

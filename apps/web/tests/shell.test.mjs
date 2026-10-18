import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startWeb } from "./helpers.mjs";

// An onboarded Learner. `progress=broken` in the cookie makes /api/progress fail.
let web;

before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (!/learner=/.test(req.headers.cookie ?? "")) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha", timezone: "UTC" });
    if (req.url === "/api/goals") return json(200, [{ status: "confirmed" }]);
    if (req.url === "/api/assessments") return json(200, [{ status: "completed" }]);
    if (req.url === "/api/progress") {
      if (/progress=broken/.test(req.headers.cookie)) return json(500, { error: "Internal Server Error" });
      return json(200, { xp: 340, streak: 12 });
    }
    if (req.url === "/api/lessons/1") return json(200, { id: "1", kind: "practice", status: "in_progress", messages: [], steps: [] });
    json(404, { error: "Not found" });
  });
});

after(() => web.close());

async function page(path, cookie = "learner=asha") {
  const response = await fetch(web.url + path, { headers: { cookie } });
  assert.equal(response.status, 200, path);
  return response.text();
}

const text = (html) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "");
const nav = (html) => html.match(/<nav[\s\S]*?<\/nav>/)?.[0];
const links = (html) => [...nav(html).matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
const href = (a) => a.match(/href="([^"]*)"/)[1];

test("every destination is in the navigation, as a link to its route", async () => {
  const html = await page("/home");
  assert.deepEqual(links(html).map(href), ["/home", "/roadmap", "/progress", "/settings"]);
  assert.deepEqual(text(nav(html)).match(/Home|Roadmap|Progress|Settings/g), ["Home", "Roadmap", "Progress", "Settings"]);
});

test("only the current destination is marked", async () => {
  for (const path of ["/home", "/roadmap", "/progress", "/settings"]) {
    const current = links(await page(path)).filter((a) => a.includes('aria-current="page"'));
    assert.deepEqual(current.map(href), [path]);
  }
});

test("destinations later tickets fill render a placeholder in the shell", async () => {
  for (const [path, title] of [["/progress", "Progress"], ["/settings", "Settings"]]) {
    assert.match(await page(path), new RegExp(`<h1[^>]*>${title}</h1>`));
  }
});

test("the Streak and XP from /api/progress are in the chrome", async () => {
  const header = text((await page("/roadmap")).match(/<header[\s\S]*?<\/header>/)[0]);
  assert.match(header, /12 day streak/);
  assert.match(header, /340 XP/);
});

test("the shell still renders when /api/progress fails, without the chips", async () => {
  const html = await page("/home", "learner=asha; progress=broken");
  assert.ok(nav(html));
  assert.doesNotMatch(text(html), /day streak|XP/);
});

test("practice screens show no navigation, only a close link back to Home", async () => {
  for (const path of ["/lessons/1", "/roleplays/1", "/assessments/1"]) {
    const html = await page(path);
    assert.equal(nav(html), undefined, path);
    assert.match(html, /<a\b[^>]*aria-label="Close"[^>]*>/, path);
    assert.equal(href(html.match(/<a\b[^>]*aria-label="Close"[^>]*>/)[0]), "/home", path);
  }
});

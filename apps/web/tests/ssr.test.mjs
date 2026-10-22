import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startWeb } from "./helpers.mjs";

// The stub API answers as the Learner named by the `learner` cookie; without one there's no session.
const learners = {
  new: { goals: [], assessments: [] },
  proposed: { goals: [{ status: "proposed" }], assessments: [{ status: "completed" }] },
  assessed: { goals: [], assessments: [{ status: "completed" }] },
  discarded: { goals: [], assessments: [{ status: "discarded" }] },
  confirmed: { goals: [{ status: "confirmed" }], assessments: [] },
};

let web;

before(async () => {
  web = await startWeb((req, res) => {
    if (/unverified=1/.test(req.headers.cookie ?? ""))
      return res
        .writeHead(403, { "content-type": "application/json" })
        .end(JSON.stringify({ error: "Verify your email" }));
    const learner = learners[/learner=(\w+)/.exec(req.headers.cookie ?? "")?.[1]];
    const json = (status, body) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (!learner) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha" });
    if (req.url === "/api/goals") return json(200, learner.goals);
    if (req.url === "/api/assessments") return json(200, learner.assessments);
    json(404, { error: "Not found" });
  });
});

after(() => web.close());

const visit = (path, cookie) => fetch(web.url + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });

async function assertRedirect(path, cookie, to) {
  const response = await visit(path, cookie);
  assert.ok(response.status >= 300 && response.status < 400, `${path} should redirect, got ${response.status}`);
  assert.equal(new URL(response.headers.get("location"), web.url).pathname, to);
}

test("a signed-out visitor is sent to sign-in", async () => {
  await assertRedirect("/home", undefined, "/sign-in");
  await assertRedirect("/goals", undefined, "/sign-in");
});

test("an unverified visitor is sent to email verification", async () => {
  await assertRedirect("/home", "unverified=1", "/verify-email");
});

test("sign-in renders with the UI stylesheet and Inter", async () => {
  const response = await visit("/sign-in");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<link rel="stylesheet" href="[^"]*styles\.css[^"]*"/);
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Inter/);
});

test("a Learner with no Goals and no Assessment is sent to set Goals", async () => {
  await assertRedirect("/home", "learner=new", "/goals");
  await assertRedirect("/home", "learner=discarded", "/goals");
});

test("a Learner with proposed Goals is sent to confirm them", async () => {
  await assertRedirect("/home", "learner=proposed", "/goals/confirm");
});

test("an onboarded Learner reaches Home", async () => {
  for (const learner of ["assessed", "confirmed"]) {
    const response = await visit("/home", `learner=${learner}`);
    assert.equal(response.status, 200, learner);
    const html = await response.text();
    assert.match(html, /<h1[^>]*>Welcome back, Asha<\/h1>/);
    assert.match(html, /name="robots" content="noindex, follow"/);
  }
});

test("Goals stay reachable while onboarding", async () => {
  assert.equal((await visit("/goals", "learner=new")).status, 200);
});

test("the theme cookie is rendered as data-theme on <html>, no cookie means light, and System renders none", async () => {
  const html = async (cookie) => (await (await visit("/sign-in", cookie)).text()).match(/<html[^>]*>/)[0];
  assert.match(await html("theme=dark"), /data-theme="dark"/);
  assert.match(await html("theme=light"), /data-theme="light"/);
  assert.match(await html(), /data-theme="light"/);
  assert.doesNotMatch(await html("theme=system"), /data-theme/);
});

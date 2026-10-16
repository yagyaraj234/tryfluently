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
    const learner = learners[/learner=(\w+)/.exec(req.headers.cookie ?? "")?.[1]];
    const json = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
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
  await assertRedirect("/", undefined, "/sign-in");
  await assertRedirect("/goals", undefined, "/sign-in");
});

test("sign-in renders with the UI stylesheet and Familjen Grotesk", async () => {
  const response = await visit("/sign-in");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<link rel="stylesheet" href="[^"]*styles\.css[^"]*"/);
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Familjen\+Grotesk/);
});

test("a Learner with no Goals and no Assessment is sent to set Goals", async () => {
  await assertRedirect("/", "learner=new", "/goals");
  await assertRedirect("/", "learner=discarded", "/goals");
});

test("a Learner with proposed Goals is sent to confirm them", async () => {
  await assertRedirect("/", "learner=proposed", "/goals/confirm");
});

test("an onboarded Learner reaches Home", async () => {
  for (const learner of ["assessed", "confirmed"]) {
    const response = await visit("/", `learner=${learner}`);
    assert.equal(response.status, 200, learner);
    assert.match(await response.text(), /<h1[^>]*>Home<\/h1>/);
  }
});

test("Goals stay reachable while onboarding", async () => {
  assert.equal((await visit("/goals", "learner=new")).status, 200);
});

test("the theme cookie is rendered as data-theme on <html>, and System renders none", async () => {
  const html = async (cookie) => (await (await visit("/sign-in", cookie)).text()).match(/<html[^>]*>/)[0];
  assert.match(await html("theme=dark"), /data-theme="dark"/);
  assert.match(await html("theme=light"), /data-theme="light"/);
  assert.doesNotMatch(await html("theme=system"), /data-theme/);
  assert.doesNotMatch(await html(), /data-theme/);
});

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buttons, startWeb } from "./helpers.mjs";

let web;

before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (!/learner=/.test(req.headers.cookie ?? "")) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha", timezone: "America/New_York" });
    if (req.url === "/api/progress") return json(200, { xp: 340, streak: 12 });
    json(404, { error: "Not found" });
  });
});

after(() => web.close());

async function page(cookie = "learner=asha") {
  const response = await fetch(web.url + "/settings", { headers: { cookie } });
  assert.equal(response.status, 200);
  return response.text();
}

const text = (html) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "");
const checkedTheme = (html) =>
  [...html.matchAll(/<[^>]*role="radio"[^>]*>[\s\S]*?(Light|Dark|System)/g)]
    .filter((m) => /aria-checked="true"/.test(m[0].match(/<[^>]*role="radio"[^>]*>/)[0]))
    .map((m) => m[1]);

test("Settings offers Light, Dark and System, with Light picked when no theme is set", async () => {
  const html = await page();
  assert.match(html, /<h1[^>]*>Settings<\/h1>/);
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
});

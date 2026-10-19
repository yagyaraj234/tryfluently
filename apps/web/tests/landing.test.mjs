import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startWeb } from "./helpers.mjs";

// The stub API knows one Learner (cookie `learner=...`). The `down` cookie makes it fail like an outage.
let web;
before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (/down=1/.test(req.headers.cookie ?? "")) return res.destroy();
    if (!/learner=/.test(req.headers.cookie ?? "")) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha" });
    json(404, { error: "Not found" });
  });
});
after(() => web.close());

const visit = (path, cookie) => fetch(web.url + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
const text = (html) =>
  html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

test("a signed-out visitor gets the full landing page as server-rendered HTML", async () => {
  const response = await visit("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.match(/<h1\b/g).length, 1);
  assert.match(html, /<h1[^>]*>[\s\S]*Lessons that change/);
  assert.equal(html.match(/<main\b/g).length, 1);
  // Every FAQ answer is in the HTML, with no script needed to reveal it.
  assert.match(text(html), /Up to 10 minutes\. It is a conversation, not an exam/);
  assert.equal(html.match(/<details\b/g).length, 6);
  for (const section of ["Assessment", "Roadmap", "Roleplay"]) assert.match(text(html), new RegExp(section));
});

test("the head carries title, description, canonical, share tags and structured data", async () => {
  const html = await (await visit("/")).text();
  assert.match(html, /<title>Impromptu \| AI English Coach for Speaking and Writing<\/title>/);
  assert.match(html, /<meta name="description" content="Practise English speaking and writing/);
  assert.match(html, /<link rel="canonical" href="http:\/\/localhost:3001\/"/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /name="twitter:card"/);
  const ld = JSON.parse(html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/)[1]);
  const types = ld["@graph"].map((n) => n["@type"]);
  assert.deepEqual(types, ["Organization", "WebSite", "SoftwareApplication", "FAQPage"]);
  assert.equal(ld["@graph"][3].mainEntity.length, 6);
});

test("the landing page still renders when the API is down", async () => {
  assert.equal((await visit("/", "down=1")).status, 200);
});

test("a signed-in Learner is sent from / to Home", async () => {
  const response = await visit("/", "learner=asha");
  assert.ok(response.status >= 300 && response.status < 400);
  assert.equal(new URL(response.headers.get("location"), web.url).pathname, "/home");
});

test("robots.txt welcomes AI crawlers on public pages, hides the app, and links the sitemap", async () => {
  const body = await (await visit("/robots.txt")).text();
  assert.match(body, /User-agent: GPTBot\nAllow: \/\$/);
  assert.match(body, /User-agent: ClaudeBot/);
  assert.match(body, /Disallow: \/api\//);
  assert.match(body, /Disallow: \/home/);
  assert.match(body, /Sitemap: http:\/\/localhost:3001\/sitemap\.xml/);
});

test("sitemap.xml lists the public pages and llms.txt summarises the product", async () => {
  const sitemap = await visit("/sitemap.xml");
  assert.match(sitemap.headers.get("content-type"), /xml/);
  assert.match(await sitemap.text(), /<loc>http:\/\/localhost:3001\/<\/loc>/);
  const llms = await (await visit("/llms.txt")).text();
  assert.match(llms, /^# Impromptu/);
  assert.match(llms, /### How long is the assessment\?/);
});

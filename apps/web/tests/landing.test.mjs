import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startWeb } from "./helpers.mjs";

// The stub API knows one Learner (cookie `learner=...`). The `down` cookie makes it fail like an outage.
let web;
before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (req.url === "/api/auth/providers") return json(200, { google: false });
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
  assert.match(html, /<h1[^>]*>[\s\S]*Speak English confidently/);
  assert.equal(html.match(/<main\b/g).length, 1);
  // Every FAQ answer is in the HTML, with no script needed to reveal it.
  assert.match(text(html), /Up to 10 minutes\. It is a conversation, not an exam/);
  assert.equal(html.match(/<details\b/g).length, 5);
  for (const section of ["Assessment", "Roadmap", "Roleplay"]) assert.match(text(html), new RegExp(section));
});

test("the head carries title, description, canonical, share tags and structured data", async () => {
  const html = await (await visit("/")).text();
  assert.match(html, /<title>Fluently \| AI English Coach for Speaking and Writing<\/title>/);
  assert.match(html, /<meta name="description" content="Practise English speaking and writing/);
  assert.match(html, /<link rel="canonical" href="http:\/\/localhost:3001\/"/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /name="twitter:card"/);
  const ld = JSON.parse(html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/)[1]);
  const types = ld["@graph"].map((n) => n["@type"]);
  assert.deepEqual(types, ["Organization", "WebSite", "SoftwareApplication", "FAQPage"]);
  assert.equal(ld["@graph"][3].mainEntity.length, 5);
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
  assert.match(llms, /^# Fluently/);
  assert.match(llms, /### How long is the assessment\?/);
});

test("free beta limits and AI limitations are visible before signup", async () => {
  const html = await (await visit("/")).text();
  const copy = text(html);
  assert.match(copy, /10 live voice minutes per month/);
  assert.match(copy, /30-minute daily cap/);
  assert.match(copy, /Future pricing is undecided/);
  assert.match(copy, /No automatic charge/);
  assert.match(copy, /Written Assessments measure grammar and vocabulary, not spoken fluency/);
  assert.match(copy, /not an official test or certificate/);
  assert.match(html, /href="\/demo"/);
  for (const path of ["privacy", "terms", "contact"]) assert.match(html, new RegExp(`href="/${path}"`));
  assert.doesNotMatch(copy, /Mastered after two Lessons|Mastered in 2 Lessons/);
});

test("demo and policy routes are public, server-rendered and survive an API outage", async () => {
  for (const [path, title] of [
    ["/demo", "Try a 1-minute sample"],
    ["/privacy", "Privacy"],
    ["/terms", "Terms"],
    ["/contact", "Talk to the builder"],
  ]) {
    const response = await visit(path, "down=1");
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.equal(html.match(/<h1\b/g).length, 1, path);
    assert.match(text(html), new RegExp(title));
    assert.match(html, new RegExp(`rel="canonical" href="http://localhost:3001${path}"`));
  }
  const demo = text(await (await visit("/demo")).text());
  assert.match(demo, /Question 1 of 2/);
  assert.match(demo, /Scripted examples/);
  const privacy = text(await (await visit("/privacy")).text());
  assert.match(privacy, /does not store raw learner audio/);
  assert.match(privacy, /Delete your account/);
  assert.match(privacy, /does not itself delete provider logs/);
});

test("signup and sign-in expose legal links, signup exposes demo and limits", async () => {
  for (const path of ["/sign-up", "/sign-in"]) {
    const response = await visit(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    for (const policy of ["privacy", "terms", "contact"]) assert.match(html, new RegExp(`href="/${policy}"`));
    if (path === "/sign-up") {
      assert.match(text(html), /10 live voice minutes\/month/);
      assert.match(html, /href="\/demo"/);
      assert.match(html, /href="\/#free"/);
    }
  }
});

test("new public routes appear in sitemap and assistant summary", async () => {
  const sitemap = await (await visit("/sitemap.xml")).text();
  const llms = await (await visit("/llms.txt")).text();
  for (const path of ["demo", "privacy", "terms", "contact"]) {
    assert.match(sitemap, new RegExp(`<loc>http://localhost:3001/${path}</loc>`));
    assert.match(llms, new RegExp(`http://localhost:3001/${path}`));
  }
});

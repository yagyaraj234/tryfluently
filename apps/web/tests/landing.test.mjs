import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startWeb } from "./helpers.mjs";

// The stub API knows one Learner (cookie `learner=...`). The `down` cookie makes it fail like an outage.
let web;
const origin = "https://fluently.example";
const previousOrigin = process.env.WEB_ORIGIN;
before(async () => {
  process.env.WEB_ORIGIN = `${origin}/`;
  web = await startWeb((req, res) => {
    const json = (status, body) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (/down=1/.test(req.headers.cookie ?? "")) return res.destroy();
    if (req.url === "/api/auth/providers") return json(200, { google: false });
    if (!/learner=/.test(req.headers.cookie ?? "")) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha" });
    json(404, { error: "Not found" });
  });
});
after(async () => {
  await web.close();
  if (previousOrigin === undefined) delete process.env.WEB_ORIGIN;
  else process.env.WEB_ORIGIN = previousOrigin;
});

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
  assert.equal(html.match(/<details\b/g).length, 8);
  assert.match(text(html), /What is Fluently\?/);
  assert.match(text(html), /not an official language certificate/);
  assert.match(text(html), /Complete all the outlined Lessons to finish a Unit/);
  assert.doesNotMatch(text(html), /Mastered after two Lessons|mastered when you hit its goal/);
  for (const section of ["Assessment", "Roadmap", "Roleplay"]) assert.match(text(html), new RegExp(section));
});

test("the head carries title, description, canonical, share tags and structured data", async () => {
  const html = await (await visit("/")).text();
  assert.match(html, /<title>Fluently \| AI English Coach for Speaking and Writing<\/title>/);
  assert.match(html, /<meta name="description" content="Practise English speaking and writing/);
  assert.ok(html.includes(`<link rel="canonical" href="${origin}/"`));
  assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large"/);
  assert.doesNotMatch(html, /name="robots" content="noindex/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  for (const name of ["og:image", "twitter:image"]) {
    assert.ok(html.includes(`="${name}" content="${origin}/og-image.png"`));
  }
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /property="og:image:type" content="image\/png"/);
  assert.match(html, /property="og:image:alt" content="[^"]+"/);
  assert.match(html, /name="twitter:image:alt" content="[^"]+"/);
  const ld = JSON.parse(html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/)[1]);
  const types = ld["@graph"].map((n) => n["@type"]);
  for (const type of ["Organization", "WebSite", "WebPage", "SoftwareApplication", "FAQPage"]) {
    assert.ok(types.includes(type), type);
  }
  const page = ld["@graph"].find((node) => node["@type"] === "WebPage");
  assert.equal(page.url, `${origin}/`);
  assert.equal(page.primaryImageOfPage.url, `${origin}/og-image.png`);
  const faq = ld["@graph"].find((node) => node["@type"] === "FAQPage");
  assert.equal(faq.mainEntity.length, 8);
  for (const question of faq.mainEntity) {
    assert.ok(text(html).includes(question.name));
    assert.ok(text(html).includes(question.acceptedAnswer.text));
  }
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
  // All named agents must share the wildcard group's restrictions.
  const groups = body
    .trim()
    .split(/\n\s*\n/)
    .filter((group) => group.startsWith("User-agent:"));
  assert.equal(groups.length, 1);
  assert.match(groups[0], /User-agent: \*\n/);
  assert.match(groups[0], /User-agent: GPTBot\n/);
  assert.match(groups[0], /Allow: \/\n/);
  assert.match(groups[0], /Disallow: \/profile/);
  assert.match(body, /User-agent: ClaudeBot/);
  assert.match(body, /Disallow: \/api\//);
  assert.match(body, /Disallow: \/home/);
  assert.ok(body.includes(`Sitemap: ${origin}/sitemap.xml`));
});

test("sitemap.xml lists the public pages and llms.txt summarises the product", async () => {
  const sitemap = await visit("/sitemap.xml");
  assert.match(sitemap.headers.get("content-type"), /xml/);
  const xml = await sitemap.text();
  assert.deepEqual(
    [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]),
    [`${origin}/`, `${origin}/sign-up`],
  );
  const llms = await (await visit("/llms.txt")).text();
  assert.match(llms, /^# Fluently/);
  assert.ok(llms.includes(`[Home](${origin}/)`));
  assert.doesNotMatch(llms, /localhost/);
  assert.match(llms, /### How long is the assessment\?/);
});

test("sign-up has its own canonical and large-image share metadata", async () => {
  const response = await visit("/sign-up?utm_source=share");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Start Your Free English Assessment \| Fluently<\/title>/);
  assert.ok(html.includes(`<link rel="canonical" href="${origin}/sign-up"`));
  assert.ok(html.includes(`property="og:url" content="${origin}/sign-up"`));
  assert.ok(html.includes(`property="og:image" content="${origin}/og-image.png"`));
  assert.match(html, /name="robots" content="index, follow/);
  assert.doesNotMatch(html, /name="robots" content="noindex/);
});

test("account, internal and missing pages stay out of search results", async () => {
  for (const path of ["/sign-in", "/verify-email", "/design-system", "/missing-page"]) {
    const response = await visit(path);
    assert.equal(response.status, path === "/missing-page" ? 404 : 200, path);
    const html = await response.text();
    assert.match(html, /name="robots" content="noindex/, path);
    assert.doesNotMatch(html, /rel="canonical"/, path);
    assert.doesNotMatch(html, /property="og:url"/, path);
  }
});

test("the OG image is a publicly fetchable 1200 by 630 PNG", async () => {
  const response = await visit("/og-image.png");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /image\/png/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
});

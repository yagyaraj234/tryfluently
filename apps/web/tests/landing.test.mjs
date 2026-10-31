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
    if (req.url === "/api/auth/providers") return json(200, { google: false });
    if (/down=1/.test(req.headers.cookie ?? "")) return res.destroy();
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
  assert.match(html, /<h1[^>]*>[\s\S]*Speak English confidently/);
  assert.equal(html.match(/<main\b/g).length, 1);
  // Every FAQ answer is in the HTML, with no script needed to reveal it.
  assert.match(
    text(html),
    /Voice Assessments take up to 10 minutes\. Written Assessments have 12 answers with no time limit/,
  );
  assert.equal(html.match(/<details\b/g).length, 6);
  assert.match(text(html), /What is Fluently\?/);
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
  assert.equal(faq.mainEntity.length, 6);
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
    ["/", "/sign-up", "/privacy", "/terms", "/contact", "/english-level-assessment", "/english-interview-practice"].map(
      (path) => `${origin}${path}`,
    ),
  );
  const llms = await (await visit("/llms.txt")).text();
  assert.match(llms, /^# Fluently/);
  assert.ok(llms.includes(`[Home](${origin}/)`));
  assert.doesNotMatch(llms, /localhost/);
  assert.match(llms, /### How long is the assessment\?/);
});

test("Free and paid limits and AI limitations are visible before signup", async () => {
  const html = await (await visit("/")).text();
  const copy = text(html);
  assert.match(copy, /25 free live voice minutes per month/);
  assert.match(copy, /30-minute daily cap/);
  assert.match(copy, /Pro is \$9\/month including tax/);
  assert.match(copy, /No paid trial or automatic top-up/);
  assert.match(copy, /Written Assessments measure grammar and vocabulary, not spoken fluency/);
  assert.match(copy, /not an official test or certificate/);
  assert.match(html, /href="\/english-level-assessment"/);
  assert.match(html, /href="\/english-interview-practice"/);
  assert.doesNotMatch(copy, /Try one answer before you sign up/);
  assert.doesNotMatch(html, /<fieldset\b/);
  for (const path of ["privacy", "terms", "contact"]) assert.match(html, new RegExp(`href="/${path}"`));
  assert.doesNotMatch(copy, /Mastered after two Lessons|Mastered in 2 Lessons/);
});

test("policy routes are public, server-rendered and survive an API outage", async () => {
  for (const [path, title] of [
    ["/privacy", "Privacy"],
    ["/terms", "Terms"],
    ["/contact", "Talk to the builder"],
  ]) {
    const response = await visit(path, "down=1");
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.equal(html.match(/<h1\b/g).length, 1, path);
    assert.match(text(html), new RegExp(title));
    assert.match(html, new RegExp(`rel="canonical" href="${origin}${path}"`));
  }
  const privacy = text(await (await visit("/privacy")).text());
  assert.match(privacy, /does not store raw learner audio/);
  assert.match(privacy, /Delete your account/);
  assert.match(privacy, /does not itself delete provider logs/);
});

test("signup and sign-in expose legal links, signup exposes voice limits", async () => {
  for (const path of ["/sign-up", "/sign-in"]) {
    const response = await visit(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    for (const policy of ["privacy", "terms", "contact"]) assert.match(html, new RegExp(`href="/${policy}"`));
    if (path === "/sign-up") {
      assert.match(text(html), /25 live voice minutes\/month/);
      assert.match(html, /href="\/#free"/);
    }
  }
});

test("new public routes appear in sitemap and assistant summary", async () => {
  const sitemap = await (await visit("/sitemap.xml")).text();
  const llms = await (await visit("/llms.txt")).text();
  for (const path of ["privacy", "terms", "contact", "english-level-assessment", "english-interview-practice"]) {
    assert.match(sitemap, new RegExp(`<loc>${origin}/${path}</loc>`));
    assert.match(llms, new RegExp(`${origin}/${path}`));
  }
});

test("learning guides render useful examples with distinct metadata, related links and signup CTAs", async () => {
  const pages = [
    ["/english-level-assessment", "English Level Assessment | Fluently", /What might you be asked\?/],
    [
      "/english-interview-practice",
      "English for Job Interviews: Practice and Examples | Fluently",
      /How to introduce yourself in an interview/,
    ],
  ];
  for (const [path, title, example] of pages) {
    const response = await visit(path, "down=1");
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.equal(html.match(/<h1\b/g)?.length, 1, path);
    assert.equal(html.match(/<main\b/g)?.length, 1, path);
    assert.ok(html.includes(`<title>${title}</title>`), path);
    assert.ok(html.includes(`rel="canonical" href="${origin}${path}"`), path);
    assert.ok(html.includes(`property="og:url" content="${origin}${path}"`), path);
    assert.match(html, /name="robots" content="index, follow, max-image-preview:large"/);
    assert.match(html, /name="description" content="[^"]+"/);
    assert.match(text(html), example);
    for (const href of [
      "/sign-up",
      "/english-level-assessment",
      "/english-interview-practice",
      "/privacy",
      "/terms",
      "/contact",
    ]) {
      assert.ok(html.includes(`href="${href}"`), `${path} links ${href}`);
    }
  }
});

test("assessment timing stays accurate in visible copy, signup and machine-readable content", async () => {
  const home = await (await visit("/")).text();
  const ld = JSON.parse(home.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/)[1]);
  const app = ld["@graph"].find((node) => node["@type"] === "SoftwareApplication");
  assert.match(app.featureList.join(" "), /Written Assessments have 12 answers with no time limit/);
  assert.doesNotMatch(
    home,
    /Take a 10-minute assessment|Talk or type for up to 10 minutes|Voice or written English assessment of up to 10 minutes/,
  );
  const guide = text(await (await visit("/english-level-assessment")).text());
  assert.match(guide, /Voice Assessments take up to 10 minutes/);
  assert.match(guide, /Written Assessments have 12 answers with no time limit/);
  const signup = text(await (await visit("/sign-up")).text());
  assert.match(signup, /Voice: up to 10 minutes\. Written: 12 answers, at your pace/);
  const llms = await (await visit("/llms.txt")).text();
  assert.match(llms, /Written Assessments have 12 answers with no time limit/);
});

test("the removed demo returns 404 and public pages no longer advertise it", async () => {
  assert.equal((await visit("/demo")).status, 404);
  for (const path of [
    "/",
    "/sign-up",
    "/contact",
    "/privacy",
    "/terms",
    "/english-level-assessment",
    "/english-interview-practice",
  ]) {
    const html = await (await visit(path)).text();
    assert.doesNotMatch(html, /href="\/demo"/, path);
    assert.doesNotMatch(
      text(html),
      /Try a sample|Try the sample|Try a free sample|Try the interactive sample|Try a 1-minute sample/,
      path,
    );
  }
  for (const path of ["/sitemap.xml", "/llms.txt"]) {
    assert.doesNotMatch(await (await visit(path)).text(), /\/demo\b/, path);
  }
});

test("sign-up has its own canonical and large-image share metadata", async () => {
  const response = await visit("/sign-up?utm_source=share");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Create a free account \| Fluently<\/title>/);
  assert.doesNotMatch(html, /Fluently \| Fluently/);
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

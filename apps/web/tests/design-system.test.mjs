import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startWeb } from "./helpers.mjs";

let web;
before(async () => {
  web = await startWeb((req, res) => res.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ error: "Private upstream detail" })));
});
after(() => web.close());

test("the Design System guide renders without auth or an available API, including component families and live tokens", async () => {
  const response = await fetch(`${web.url}/design-system`);
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const content of ["Colour tokens", "Typography", "Forms", "Overlays and toasts", "Lesson Steps", "Voice and recording", "Roadmap and progress", "Assessment Report", "Lesson complete"]) {
    assert.ok(html.includes(content), content);
  }
  assert.match(html, /--color-primary/);
  assert.match(html, /Recording preview state/);
  assert.match(html, /name="robots" content="noindex"/);
});

test("the theme cookie applies before the guide paints", async () => {
  const html = await (await fetch(`${web.url}/design-system`, { headers: { cookie: "theme=dark" } })).text();
  assert.match(html, /<html[^>]*data-theme="dark"/);
});

test("shell examples are separate pages with one main landmark", async () => {
  for (const preview of ["app", "practice"]) {
    const html = await (await fetch(`${web.url}/design-system?preview=${preview}`)).text();
    assert.equal([...html.matchAll(/<main\b/g)].length, 1);
    assert.ok(html.includes(preview === "app" ? "AppShell preview" : "PracticeShell preview"));
  }
});

test("a missing route offers Home with a 404", async () => {
  const response = await fetch(`${web.url}/missing-v1-route`);
  assert.equal(response.status, 404);
  const html = await response.text();
  assert.match(html, /We couldn&#x27;t find that page|We couldn't find that page/);
  assert.match(html, /Go to Home/);
  assert.match(html, /<html/);
});

test("a failed route offers recovery without exposing upstream details", async () => {
  const response = await fetch(`${web.url}/settings`);
  assert.equal(response.status, 500);
  const html = await response.text();
  assert.match(html, /We couldn&#x27;t load this page|We couldn't load this page/);
  assert.match(html, /Try again/);
  assert.doesNotMatch(html, /Private upstream detail/);
  assert.match(html, /<html/);
});

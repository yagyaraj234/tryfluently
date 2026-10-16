import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startWeb } from "./helpers.mjs";

// Sign-up, sign-in, setting Goals and choosing an Assessment, rendered on the server against a stub API.
let google = false;
let web;

before(async () => {
  web = await startWeb((req, res) => {
    const json = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (req.url === "/api/auth/providers") return json(200, { google });
    if (!/learner=new/.test(req.headers.cookie ?? "")) return json(401, { error: "Unauthorized" });
    if (req.url === "/api/me") return json(200, { id: "1", name: "Asha" });
    json(404, { error: "Not found" });
  });
});

after(() => web.close());

const page = async (path, cookie) => {
  const response = await fetch(web.url + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  assert.equal(response.status, 200, path);
  return response.text();
};
const label = (text) => new RegExp(`<label[^>]*>${text}</label>`);

test("sign-in asks for email and password and links to sign-up", async () => {
  const html = await page("/sign-in");
  assert.match(html, label("Email"));
  assert.match(html, label("Password"));
  assert.match(html, /<button[^>]*type="submit"[^>]*>Sign in<\/button>/);
  assert.match(html, /href="\/sign-up"/);
});

test("sign-up asks for name, email and password and links to sign-in", async () => {
  const html = await page("/sign-up");
  for (const field of ["Name", "Email", "Password"]) assert.match(html, label(field));
  assert.match(html, /<button[^>]*type="submit"[^>]*>Create account<\/button>/);
  assert.match(html, /href="\/sign-in"/);
});

test("Google shows only when the API offers it", async () => {
  google = false;
  assert.doesNotMatch(await page("/sign-in"), /Continue with Google/);
  assert.doesNotMatch(await page("/sign-up"), /Continue with Google/);
  google = true;
  assert.match(await page("/sign-in"), /Continue with Google/);
  assert.match(await page("/sign-up"), /Continue with Google/);
  google = false;
});

test("setting Goals offers the three Goals, and skipping goes to choosing an Assessment", async () => {
  const html = await page("/goals", "learner=new");
  for (const goal of ["Job Interview", "Client Communication", "General Fluency"]) assert.match(html, new RegExp(goal));
  assert.match(html, /href="\/assessments\/new"/);
  assert.match(html, /Sign out/);
});

test("choosing an Assessment offers Voice and Written, with how long each takes", async () => {
  const html = await page("/assessments/new", "learner=new");
  assert.match(html, /Voice Assessment/);
  assert.match(html, /Written Assessment/);
  assert.match(html, /10 minutes/);
});

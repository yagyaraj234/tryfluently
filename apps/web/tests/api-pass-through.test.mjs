import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readBody, startWeb } from "./helpers.mjs";

let web;
let releaseStream;

before(async () => {
  web = await startWeb(async (req, res) => {
    if (req.url === "/api/stream") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: first\n\n");
      await new Promise((resolve) => (releaseStream = resolve));
      res.end("data: second\n\n");
      return;
    }
    const body = await readBody(req);
    res.writeHead(201, {
      "content-type": req.headers["content-type"] === "application/sdp" ? "application/sdp" : "application/json",
      "set-cookie": ["session=abc; Path=/; HttpOnly", "theme=dark; Path=/"],
    });
    res.end(
      req.headers["content-type"] === "application/sdp"
        ? `answer for ${body}`
        : JSON.stringify({ method: req.method, url: req.url, cookie: req.headers.cookie, body }),
    );
  });
});

after(() => web.close());

test("forwards method, path, query, body and cookie, and returns every set-cookie", async () => {
  const response = await fetch(`${web.url}/api/goals/1/confirm?from=home`, {
    method: "POST",
    headers: { cookie: "session=abc", "content-type": "application/json" },
    body: JSON.stringify({ kind: "job_interview" }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(response.headers.getSetCookie(), ["session=abc; Path=/; HttpOnly", "theme=dark; Path=/"]);
  assert.deepEqual(await response.json(), {
    method: "POST",
    url: "/api/goals/1/confirm?from=home",
    cookie: "session=abc",
    body: '{"kind":"job_interview"}',
  });
});

test("passes an application/sdp body through both ways", async () => {
  const response = await fetch(`${web.url}/api/assessments/1/call`, {
    method: "POST",
    headers: { "content-type": "application/sdp" },
    body: "v=0 offer",
  });

  assert.equal(response.headers.get("content-type"), "application/sdp");
  assert.equal(await response.text(), "answer for v=0 offer");
});

test("keeps a streamed response streamed", { timeout: 10_000 }, async () => {
  const response = await fetch(`${web.url}/api/stream`);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

  // The API holds the rest back until the first chunk arrives, so a buffering proxy would hang here.
  assert.equal((await reader.read()).value, "data: first\n\n");
  releaseStream();
  let rest = "";
  for (let r = await reader.read(); !r.done; r = await reader.read()) rest += r.value;
  assert.equal(rest, "data: second\n\n");
});

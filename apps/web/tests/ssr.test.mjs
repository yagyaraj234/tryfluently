import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

test("renders query data in HTML with a fresh cache per request", { timeout: 60_000 }, async () => {
  const server = await createServer({
    server: { host: "127.0.0.1", port: 0 },
  });

  try {
    await server.listen();
    const url = server.resolvedUrls.local[0];
    const readTime = async () => {
      const response = await fetch(url);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/html/);
      const html = await response.text();
      assert.match(html, /<h1>Impromptu<\/h1>/);
      const time = html.match(/<time dateTime="([^"]+)">([^<]+)<\/time>/);
      assert.ok(time, "Query data must be rendered before JavaScript runs");
      assert.equal(time[1], time[2]);
      assert.ok(Number.isFinite(Date.parse(time[1])));
      return time[1];
    };

    const first = await readTime();
    const second = await readTime();
    assert.notEqual(first, second, "SSR requests must not reuse the Query cache");
  } finally {
    await server.close();
  }
});

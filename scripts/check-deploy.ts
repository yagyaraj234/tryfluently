import assert from "node:assert/strict";

// Exercise the built SSR entry and static server, including the existing API pass-through.
const api = Bun.serve({
  port: 0,
  fetch: (request) =>
    new URL(request.url).pathname === "/api/me"
      ? Response.json({ error: "Unauthorized" }, { status: 401 })
      : new Response("ok", { headers: { "set-cookie": "probe=ok; HttpOnly; Path=/" } }),
});
const portProbe = Bun.serve({ port: 0, fetch: () => new Response() });
const port = portProbe.port!;
await portProbe.stop(true);
const child = Bun.spawn([process.execPath, "server.ts"], {
  cwd: new URL("../apps/web", import.meta.url).pathname,
  env: { ...process.env, NODE_ENV: "production", PORT: String(port), API_URL: api.url.origin },
  stdout: "inherit",
  stderr: "inherit",
});
const origin = `http://127.0.0.1:${port}`;

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Web server exited: ${child.exitCode}`);
    try {
      ready = (await fetch(`${origin}/api/auth/providers`)).ok;
    } catch {}
    if (ready) break;
    await Bun.sleep(100);
  }
  assert.ok(ready, "Production server did not become ready");
  const page = await fetch(origin);
  const html = await page.text();
  assert.equal(page.status, 200, html);
  assert.match(html, /<html/);
  const asset = html.match(/(?:src|href)="(\/assets\/[^"?]+\.js)/)?.[1];
  assert.ok(asset, "SSR must reference a built JavaScript asset");
  const javascript = await fetch(`${origin}${asset}`);
  assert.equal(javascript.status, 200);
  assert.match(javascript.headers.get("content-type")!, /javascript/);
  const head = await fetch(`${origin}${asset}`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const proxy = await fetch(`${origin}/api/auth/providers`);
  assert.equal(await proxy.text(), "ok");
  assert.match(proxy.headers.get("set-cookie")!, /probe=ok/);
  assert.equal((await fetch(`${origin}/.env`)).status, 404);
  assert.equal((await fetch(`${origin}/%2e%2e%2f%2e%2e%2f.env`)).status, 404);
  console.log("Production server: SSR, assets, HEAD, API proxy, cookies, and private paths passed.");
} finally {
  child.kill();
  await child.exited;
  await api.stop(true);
}

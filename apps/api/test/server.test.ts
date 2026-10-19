import { expect, test } from "bun:test";

test("the API server keeps AI streams open before and between chunks", async () => {
  // Exercise the real server options with Node's fetch, as used by the web proxy.
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `
    import config from "./src/index.ts";
    const server = Bun.serve({ ...config, port: 0, fetch: (request) => new Response(new ReadableStream({
      start(controller) {
        if (!request.url.endsWith("cold")) controller.enqueue(new TextEncoder().encode("first"));
        this.timer = setTimeout(() => {
          controller.enqueue(new TextEncoder().encode("last"));
          controller.close();
        }, 15000);
      },
      cancel() { clearTimeout(this.timer); }
    })) });
    const client = Bun.spawn(["node", "--input-type=module", "-e",
      'import assert from "node:assert/strict"; await Promise.all(["", "cold"].map(async (path) => { const response = await fetch(process.argv[1] + path, {signal: AbortSignal.timeout(25000)}); assert.equal(response.status, 200); assert.equal(await response.text(), path ? "last" : "firstlast"); }));',
      String(server.url)], { stdout: "inherit", stderr: "inherit" });
    try { process.exitCode = await client.exited; }
    finally { server.stop(true); }
  `,
    ],
    {
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        PATH: process.env.PATH,
        DATABASE_URL: "postgres://unused:unused@localhost:1/unused",
        BETTER_AUTH_SECRET: "synthetic-server-test-secret-with-enough-length",
        BETTER_AUTH_URL: "http://localhost:3000",
        WEB_ORIGIN: "http://localhost:5173",
        RESEND_API_KEY: "unused",
        EMAIL_FROM: "test@example.com",
        OPENAI_API_KEY: "unused",
        KENPATH_BASE_URL: "http://localhost:1",
        KENPATH_API_KEY: "unused",
        KENPATH_MODEL: "unused",
        ...Object.fromEntries(
          ["STEP", "BRIEF", "ROADMAP", "JUDGE", "REPORT"].map((job) => [`MODEL_${job}`, "openai:gpt-4.1-mini"]),
        ),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  try {
    const [exit, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(stderr).not.toContain("UND_ERR_SOCKET");
    expect(exit, stderr).toBe(0);
  } finally {
    child.kill();
  }
}, 30_000);

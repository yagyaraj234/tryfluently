import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import server from "./dist/server/server.js";

const app = new Hono();
app.use("*", serveStatic({ root: "./dist/client" }));
app.all("*", (c) => server.fetch(c.req.raw));

export default {
  hostname: "0.0.0.0",
  port: Number(process.env.PORT ?? 3001),
  idleTimeout: 120,
  fetch: app.fetch,
};

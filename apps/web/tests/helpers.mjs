import { createServer as createHttpServer } from "node:http";
import { createServer } from "vite";

/** Starts a stub API (a plain node:http handler) and the web dev server pointed at it with API_URL. */
export async function startWeb(handleApi) {
  const api = createHttpServer(handleApi);
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  process.env.API_URL = `http://127.0.0.1:${api.address().port}`;

  const web = await createServer({ server: { host: "127.0.0.1", port: 0 } });
  await web.listen();
  return {
    url: web.resolvedUrls.local[0].replace(/\/$/, ""),
    async close() {
      await web.close();
      api.closeAllConnections();
      api.close();
    },
  };
}

export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

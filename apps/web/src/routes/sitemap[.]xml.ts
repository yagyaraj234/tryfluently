import { createFileRoute } from "@tanstack/react-router";
import { publicPaths } from "../content/landing";
import { siteOrigin } from "../lib/site";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const origin = siteOrigin();
        const urls = publicPaths.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join("\n");
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
        return new Response(body, {
          headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { siteOrigin } from "../lib/site";

// Search and AI crawlers are welcome on the public pages; the signed-in app and the API are not for them.
const aiCrawlers = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        const origin = siteOrigin();
        const body = [
          ...["*", ...aiCrawlers].map((bot) => `User-agent: ${bot}`),
          "Allow: /",
          "Disallow: /api/",
          "Disallow: /home",
          "Disallow: /roadmap",
          "Disallow: /progress",
          "Disallow: /profile",
          "Disallow: /settings",
          "Disallow: /goals",
          "Disallow: /assessments",
          "Disallow: /roleplays",
          "Disallow: /lessons",
          "Disallow: /design-system",
          "",
          `Sitemap: ${origin}/sitemap.xml`,
          "",
        ].join("\n");
        return new Response(body, {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      },
    },
  },
});

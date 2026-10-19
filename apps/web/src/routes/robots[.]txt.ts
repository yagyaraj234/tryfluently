import { createFileRoute } from "@tanstack/react-router";

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
        const origin = (process.env.WEB_ORIGIN ?? "http://localhost:3001").replace(/\/$/, "");
        const body = [
          "User-agent: *",
          "Allow: /$",
          "Allow: /sign-up",
          "Disallow: /api/",
          "Disallow: /home",
          "Disallow: /roadmap",
          "Disallow: /progress",
          "Disallow: /settings",
          "Disallow: /goals",
          "Disallow: /assessments",
          "Disallow: /roleplays",
          "Disallow: /lessons",
          "Disallow: /design-system",
          "",
          ...aiCrawlers.flatMap((bot) => [
            `User-agent: ${bot}`,
            "Allow: /$",
            "Allow: /llms.txt",
            "Disallow: /api/",
            "",
          ]),
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

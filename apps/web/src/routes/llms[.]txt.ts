import { createFileRoute } from "@tanstack/react-router";
import { faqs, site } from "../content/landing";

// A plain-text summary for AI assistants (llmstxt.org), built from the same words as the landing page.
export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: () => {
        const origin = (process.env.WEB_ORIGIN ?? "http://localhost:3001").replace(/\/$/, "");
        const body = [
          `# ${site.name}`,
          "",
          `> ${site.summary}`,
          "",
          "## Pages",
          "",
          `- [Home](${origin}/): what Impromptu does, how it works and common questions`,
          `- [Sign up](${origin}/sign-up): create a free account and start the assessment`,
          "",
          "## Questions and answers",
          "",
          ...faqs.flatMap((f) => [`### ${f.question}`, "", f.answer, ""]),
        ].join("\n");
        return new Response(body, {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      },
    },
  },
});

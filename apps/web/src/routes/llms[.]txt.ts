import { createFileRoute } from "@tanstack/react-router";
import { faqs, learningPages, site } from "../content/landing";
import { siteOrigin } from "../lib/site";

// A plain-text summary for AI assistants (llmstxt.org), built from the same words as the landing page.
export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: () => {
        const origin = siteOrigin();
        const body = [
          `# ${site.name}`,
          "",
          `> ${site.summary}`,
          "",
          "## Pages",
          "",
          `- [Home](${origin}/): what Fluently does, how it works and common questions`,
          ...Object.values(learningPages).map(
            (page) => `- [${page.title}](${origin}${page.path}): ${page.description}`,
          ),
          `- [Sign up](${origin}/sign-up): create a free account and start the assessment`,
          `- [Privacy](${origin}/privacy): voice processing, transcripts and account deletion`,
          `- [Terms](${origin}/terms): beta access, usage limits and AI feedback limitations`,
          `- [Contact](${origin}/contact): support and beta voice credit requests`,
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

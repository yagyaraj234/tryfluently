import { createIsomorphicFn } from "@tanstack/react-start";

/** The public origin, for canonical and share URLs. Server: WEB_ORIGIN. Browser: wherever the page was loaded from. */
export const siteOrigin = createIsomorphicFn()
  .server(() => (process.env.WEB_ORIGIN ?? "http://localhost:3001").replace(/\/$/, ""))
  .client(() => window.location.origin);

export function publicPageHead(path: string, title: string, description: string) {
  const url = `${siteOrigin()}${path}`;
  return {
    meta: [
      { title: `${title} | Fluently` },
      { name: "description", content: description },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: `${title} | Fluently` },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

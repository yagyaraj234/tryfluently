import { createIsomorphicFn } from "@tanstack/react-start";
import { site } from "../content/landing";

/** The public origin, for canonical and share URLs. Server: WEB_ORIGIN. Browser: wherever the page was loaded from. */
export const siteOrigin = createIsomorphicFn()
  .server(() => new URL(process.env.WEB_ORIGIN ?? "http://localhost:3001").origin)
  .client(() => window.location.origin);

/** Only public, indexable routes opt in; account and Learner pages inherit noindex from the root. */
export function publicPageHead(path: string, title: string, description: string) {
  const origin = siteOrigin();
  const image = `${origin}${site.image}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: site.name },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: `${origin}${path}` },
      { property: "og:image", content: image },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: site.imageAlt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
      { name: "twitter:image:alt", content: site.imageAlt },
    ],
    links: [{ rel: "canonical", href: `${origin}${path}` }],
  };
}

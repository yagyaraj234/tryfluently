import { createIsomorphicFn } from "@tanstack/react-start";

/** The public origin, for canonical and share URLs. Server: WEB_ORIGIN. Browser: wherever the page was loaded from. */
export const siteOrigin = createIsomorphicFn()
  .server(() => (process.env.WEB_ORIGIN ?? "http://localhost:3001").replace(/\/$/, ""))
  .client(() => window.location.origin);

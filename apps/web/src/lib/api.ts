import type { AppType } from "@fluently/api";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { hc } from "hono/client";

export const apiUrl = () => process.env.API_URL ?? "http://localhost:3000";

/**
 * The typed API client: `api().api.goals.$get()`.
 * In the browser it calls `/api` on the web origin (see routes/api/$.ts). While server rendering it
 * calls the API directly and forwards the Learner's `cookie` header.
 */
export const api = createIsomorphicFn()
  .server(() => hc<AppType>(apiUrl(), { headers: { cookie: getRequestHeader("cookie") ?? "" } }))
  .client(() => hc<AppType>(window.location.origin));

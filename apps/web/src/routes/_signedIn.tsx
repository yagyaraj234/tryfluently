import { createFileRoute, redirect } from "@tanstack/react-router";
import { api } from "../lib/api";

/**
 * Every route under `_signedIn/` needs a session; without one the visitor is sent to sign-in.
 * Child routes read the Learner with `Route.useRouteContext().learner`.
 */
export const Route = createFileRoute("/_signedIn")({
  beforeLoad: async () => {
    // ponytail: one /api/me call per navigation; cache it in the QueryClient if it ever shows up as slow.
    const response = await api().api.me.$get();
    if (response.status === 401) throw redirect({ to: "/sign-in" });
    if (!response.ok) throw new Error(`Couldn't load your session (${response.status})`);
    return { learner: await response.json() };
  },
});

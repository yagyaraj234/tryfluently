import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_signedIn/_app/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/profile", replace: true });
  },
});

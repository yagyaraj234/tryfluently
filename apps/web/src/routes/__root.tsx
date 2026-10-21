import { MagnifyingGlass } from "@phosphor-icons/react";
import { Button, EmptyState, ErrorState, OfflineBanner, Screen, UIProvider } from "@fluently/ui";
import appCss from "@fluently/ui/styles.css?url";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Link, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import { dataTheme } from "../lib/theme";
import { useOnline } from "../hooks/useOnline";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: () => ({ theme: dataTheme() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Fluently" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap" },
    ],
  }),
  component: Root,
  errorComponent: RouteError,
  notFoundComponent: NotFound,
});

export function RouteError() {
  const router = useRouter();
  return (
    <ErrorState
      title="We couldn't load this page"
      description="Check your connection and try again."
      onRetry={() => router.invalidate()}
    />
  );
}

function NotFound() {
  return (
    <Screen>
      <EmptyState
        icon={MagnifyingGlass}
        title="We couldn't find that page"
        action={<Button render={<Link to="/home" />}>Go to Home</Button>}
      />
    </Screen>
  );
}

function Root() {
  const { theme } = Route.useRouteContext();
  const online = useOnline();
  return (
    <html lang="en" data-theme={theme}>
      <head>
        <HeadContent />
      </head>
      <body>
        <UIProvider>
          {!online && <OfflineBanner />}
          <Outlet />
        </UIProvider>
        <Scripts />
      </body>
    </html>
  );
}

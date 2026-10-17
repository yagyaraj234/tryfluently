import { UIProvider } from "@impromptu/ui";
import appCss from "@impromptu/ui/styles.css?url";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { dataTheme } from "../theme";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: () => ({ theme: dataTheme() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Impromptu" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;700&display=swap" },
    ],
  }),
  component: Root,
});

function Root() {
  const { theme } = Route.useRouteContext();
  return (
    <html lang="en" data-theme={theme}>
      <head>
        <HeadContent />
      </head>
      <body>
        <UIProvider>
          <Outlet />
        </UIProvider>
        <Scripts />
      </body>
    </html>
  );
}

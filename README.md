# impromptu-monorepo

## Web app

`apps/web` is a TanStack Start React app with TanStack Query and SSR.
Requires Bun 1.3.6 and Node.js 22.12+ (Node.js 24 recommended).

```sh
bun install
bun run --filter @impromptu/web dev
```

Open http://localhost:3001. The API defaults to port 3000.
`bun run dev` starts all workspace development servers; the API requires its environment variables.

```sh
bun run build
bun run --filter @impromptu/web preview
bun run typecheck
bun run --filter @impromptu/web test
```

The home route preloads a server function through Query and renders its result in
the initial HTML. Each SSR request creates its own QueryClient; the
[@tanstack/react-router-ssr-query integration](https://tanstack.com/router/latest/docs/integrations/query)
handles the provider, dehydration, and browser hydration. Fresh data stays cached
for one minute. File routes live in `apps/web/src/routes`; Start generates
`src/routeTree.gen.ts` during development and builds. Commit the generated route
tree so typechecking works immediately after checkout.

The smoke test starts a local Vite server and verifies server-rendered query data
and independent caches across requests. The scaffold does not connect to the API yet.

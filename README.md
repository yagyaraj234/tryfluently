# impromptu-monorepo

## Web app

`apps/web` is a TanStack Start React app with TanStack Query and SSR, built from `@impromptu/ui`.
Requires Bun 1.3.6 and Node.js 22.12+ (Node.js 24 recommended).

### Running web and API together

The browser only talks to the web app. The web server passes every `/api/*` request through to the
API at `API_URL` (default `http://localhost:3000`), cookies included, so Better Auth cookies are
first-party and no CORS setup is needed.

```sh
bun install
bun run db:up                              # Postgres on :5433
cp .env.example apps/api/.env              # then fill in the keys
bun run db:migrate
bun run --filter @impromptu/api dev        # API on :3000
bun run --filter @impromptu/web dev        # web on :3001
```

Open http://localhost:3001. `WEB_ORIGIN` and `BETTER_AUTH_URL` point at the web origin, because that's
where the browser reaches the API. `bun run dev` starts both at once.

```sh
bun run build
bun run --filter @impromptu/web preview
bun run typecheck
bun run --filter @impromptu/web test
```

### How the app is wired

- `src/routes/api/$.ts` is the `/api/*` pass-through.
- `src/api.ts` exports `api()`, the typed Hono client for `@impromptu/api`. During server rendering it
  calls the API directly with the Learner's `cookie` header.
- `src/auth.ts` exports `authClient`, Better Auth on the web origin, plus `signUp` (sends the browser's
  timezone) and `signInWithGoogle`. `GET /api/auth/providers` says whether Google is configured.
- `src/AuthScreen.tsx` is the shared sign-in / sign-up screen. `/goals` sets Goals with Goal Context, and
  `/assessments/new` starts a Voice or Written Assessment (and shows the retake lock).
- `src/routes/_signedIn.tsx` guards every route inside `src/routes/_signedIn/`: no session redirects to
  `/sign-in`. Home sends Learners who haven't finished onboarding on to set or confirm their Goals.
- `src/theme.ts` reads the Light/Dark/System `theme` cookie, rendered as `data-theme` on `<html>`.
- Apps never style anything: no `className`, `style` or CSS. Missing pieces go into `@impromptu/ui`.

File routes live in `apps/web/src/routes`; Start generates `src/routeTree.gen.ts` during development
and builds. Commit the generated route tree so typechecking works immediately after checkout.

The tests start the dev server against a stub API and check the pass-through, the signed-in guard,
onboarding routing and the theme cookie in server-rendered HTML.

### Design System and v1 verification

Open `/design-system` for live tokens and component previews, with theme controls on a quiet surface.
The guide works without signing in or configuring AI services. Shell previews open through links
inside the guide; all actions use example content.

See [the v1 acceptance audit](docs/v1-acceptance.md) for spec coverage, verification results and
the remaining live-service release gates.

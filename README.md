# Impromptu

AI English coach for job interviews, client communication and everyday fluency. Learners set Goals, complete an Assessment, then practise through an adaptive Roadmap of Lessons and Roleplays.

This Bun workspace contains the Hono API (`apps/api`), TanStack Start web app (`apps/web`), Postgres schema (`packages/db`) and shared design system (`packages/ui`).

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
cp .env.example .env                       # then fill in the keys
bun run db:migrate
bun run dev                                # API on :3000, web on :3001
```

Open http://localhost:3001. `WEB_ORIGIN` and `BETTER_AUTH_URL` point at the web origin, because that's
where the browser reaches the API.
The API dev script loads the root `.env`. It requires the database, auth, OpenAI, Resend and Kenpath settings at startup; Google credentials are optional. The web server uses `API_URL` to reach the API.

API reference: http://localhost:3000/docs. The OpenAPI document is served at
http://localhost:3000/docs/openapi.json. Operations are listed from the Hono
routes; request and response schemas are not yet included.

For local API metrics, keep `METRICS_ENABLED=true` in the root `.env` and run
`docker compose -f docker-compose.monitoring.yml up -d`. See
[infra/monitoring/README.md](infra/monitoring/README.md) for Grafana access and
dashboard details.

```sh
bun run build
bun run --filter @impromptu/web preview
bun run typecheck
bun run --filter @impromptu/web test
```

### How the app is wired

- `apps/web/src/routes/api/$.ts` is the `/api/*` pass-through.
- `apps/web/src/lib/api.ts` exports `api()`, the typed Hono client for `@impromptu/api`. During server rendering it
  calls the API directly with the Learner's `cookie` header.
- `apps/web/src/lib/auth.ts` exports `authClient`, Better Auth on the web origin, plus `signUp` (sends the browser's
  timezone) and `signInWithGoogle`. `GET /api/auth/providers` says whether Google is configured.
- `apps/web/src/components/auth/AuthScreen.tsx` is the shared sign-in / sign-up screen. `/goals` sets Goals with Goal Context, and
  `/assessments/new` starts a Voice or Written Assessment (and shows the retake lock).
- `apps/web/src/routes/_signedIn.tsx` guards every route inside `apps/web/src/routes/_signedIn/`: no session redirects to
  `/sign-in`. Home sends Learners who haven't finished onboarding on to set or confirm their Goals.
- `apps/web/src/lib/theme.ts` reads the Light/Dark/System `theme` cookie, rendered as `data-theme` on `<html>`.
- `apps/web/src/router.tsx` creates a QueryClient per server request, keeping Learners' cached data separate.
- Apps never style anything: no `className`, `style` or CSS. Missing pieces go into `@impromptu/ui`.

File routes live in `apps/web/src/routes`; Start generates `src/routeTree.gen.ts` during development
and builds. Commit the generated route tree so typechecking works immediately after checkout.

Web tests start the dev server against a stub API and check the pass-through, signed-in guard,
onboarding routing, theme cookie and practice flows.

### Design System and v1 verification

Open `/design-system` for live tokens and component previews, with Light / Dark / System theme controls.
The guide works without signing in or configuring AI services. Shell previews open through links
inside the guide; all actions use example content.

See [the v1 acceptance audit](docs/v1-acceptance.md) for spec coverage, verification results and
the remaining live-service release gates.

## Documentation

- [GLOSSARY.md](GLOSSARY.md): product terms used in code, UI and specs.
- [DESIGN.md](DESIGN.md): design tokens, components and interface rules.
- [docs/adr/](docs/adr/): decisions on voice and adaptive generation.
- [docs/research/](docs/research/): dated research notes and implementation proposals. Read the current code before applying a proposal.
- [docs/agents/](docs/agents/): GitHub issue and domain-document conventions for agents.
- [infra/monitoring/README.md](infra/monitoring/README.md): local Prometheus and Grafana setup.

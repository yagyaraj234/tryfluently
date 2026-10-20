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

### Deploy on a Linux VM

Install Docker Engine with the Compose plugin, enable Docker at boot, and install Bun 1.3.6.
Clone the repo on the VM. Copy `.env.example` to `.env`, fill in the service keys, then set:

```dotenv
DATABASE_URL=postgresql://user:password@your-neon-host/neondb?sslmode=require
BETTER_AUTH_SECRET=replace-with-a-long-random-secret
BETTER_AUTH_URL=https://your-domain.example
WEB_ORIGIN=https://your-domain.example
```

Copy the direct connection string from Neon's Connect dialog with connection pooling disabled.
Keep its SSL parameters. This deployment uses the same URL for migrations and the API.
See [Neon's connection guide](https://neon.com/docs/connect/connect-from-any-app).
The database runs in Neon; the API, web server, and Caddy reverse proxy run on the VM.
URL-encode the password in `DATABASE_URL` if it contains special characters. Protect `.env`
with `chmod 600 .env`.

Point your domain's DNS A record at the VM's public IPv4 address. If you publish an AAAA record,
it must reach the same VM over IPv6. Allow inbound TCP ports 80 and 443 in the VM firewall and
cloud security group; UDP 443 is optional for HTTP/3. Keep SSH access available.
Ports 80 and 443 must be free for Caddy. Set `WEB_ORIGIN` and `BETTER_AUTH_URL` to the same
public HTTPS origin, with no path (for example, `https://app.example.com`). On the VM, run:

```sh
bun run deploy
```

This builds the web app, applies pending migrations to `DATABASE_URL`, and starts the API and
production SSR/static web server and Caddy in the background. It waits for health checks before succeeding.
Run the same command after updating the checkout. A failed migration blocks the new API from
starting; migrations can change existing data, so back up Postgres before deploying schema changes.
Deployments can briefly interrupt active calls and requests.

Caddy uses `WEB_ORIGIN` as its public site address, obtains and renews TLS certificates, and
redirects HTTP to HTTPS. It forwards requests to `web:3001`, including streaming responses;
the web server forwards `/api/*` to the API. Only Caddy's ports are published. API and web
ports stay private in Docker. See [Caddy's automatic HTTPS requirements](https://caddyserver.com/docs/automatic-https).
The proxy health check confirms Caddy has loaded its configuration; it does not verify public
DNS or certificate issuance. After deploying, open your HTTPS domain and check proxy logs if TLS fails.

Containers restart after crashes or VM reboots when Docker starts. Database data stays in Neon.
Caddy certificates persist in the `caddy_data` Docker volume; keep this volume between deploys.
Use a dedicated Neon database or branch for this app: deployment applies this repo's schema there.
Existing local data is not transferred automatically. Removing containers does not remove Neon data.

```sh
docker compose --env-file .env -f docker-compose.production.yml logs -f proxy api web
docker compose --env-file .env -f docker-compose.production.yml down  # stop the app
```

Build tools stay in Docker's build stage; runtime images keep only production dependencies.
The API and web containers do not mount the checkout, so host `node_modules` directories can be removed
after deployment. Keep `.env`, `Caddyfile`, and the checkout for future deploys. Do not delete `node_modules`
inside the runtime image: the API and SSR server still need them. Removing files saves disk
space; it does not reduce server RAM. Docker also retains build cache for faster redeploys;
`docker builder prune` interactively removes unused build cache when disk space is tight.

The image pins Bun 1.4.3. To check the built production web server inside the runtime image:

```sh
docker run --rm -v "$PWD/scripts/check-deploy.ts:/app/scripts/check-deploy.ts:ro" impromptu-runtime bun /app/scripts/check-deploy.ts
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

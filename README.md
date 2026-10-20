# Fluently

AI English coach for job interviews, client communication and everyday fluency. Learners set Goals, complete an Assessment, then practise through an adaptive Roadmap of Lessons and Roleplays.

This Bun workspace contains the Hono API (`apps/api`), TanStack Start web app (`apps/web`), Postgres schema (`packages/db`) and shared design system (`packages/ui`).

## Run locally

Choose either development mode or Docker below. Both need service credentials in a root `.env` file.

```sh
git clone https://github.com/yagyaraj234/impromptu-monorepo.git
cd impromptu-monorepo
cp .env.example .env
```

### Configure the environment

Edit `.env` before starting the app:

| Variable                                                                                      | Value                                                                                                                 |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                                                                          | Replace `change-me` with a random secret, for example from `openssl rand -hex 32`.                                    |
| `OPENAI_API_KEY`                                                                              | Your OpenAI key with access to the models in `.env.example`.                                                          |
| `MODEL_STEP`, `MODEL_BRIEF`, `MODEL_ROADMAP`, `MODEL_JUDGE`, `MODEL_REPORT`, `MODEL_REALTIME` | Keep the example values, or choose models available to your account.                                                  |
| `RESEND_API_KEY`, `EMAIL_FROM`                                                                | Your Resend key and an allowed sender. Email sign-up requires a verification email.                                   |
| `KENPATH_BASE_URL`, `KENPATH_API_KEY`, `KENPATH_MODEL`                                        | Your Kenpath API URL, key and speech model; required at API startup.                                                  |
| `KENPATH_VOICE`                                                                               | A supported voice ID for Reference Pronunciation. Without it, pronunciation playback is unavailable.                  |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                    | Optional Google sign-in; otherwise leave blank. Register `<web-origin>/api/auth/callback/google` as its redirect URI. |
| `GOOGLE_GENERATIVE_AI_API_KEY`                                                                | Only needed when a text model uses the `google:` provider.                                                            |

Use the database and origin settings shown for your chosen mode below. Keep `.env` private; it is ignored by Git. The full app needs working provider credentials, and provider usage may incur charges.

### Option 1: development mode

Install Bun 1.3.6, Node.js 22.12+ (Node.js 24 recommended), and Docker with the Compose plugin. Start Docker for local Postgres. Bun is required by the workspace scripts even when using `npm run dev`.

Keep these values in `.env`:

```dotenv
DATABASE_URL=postgres://impromptu:impromptu@localhost:5433/impromptu
BETTER_AUTH_URL=http://localhost:3001
WEB_ORIGIN=http://localhost:3001
API_URL=http://localhost:3000
```

```sh
bun install --frozen-lockfile
bun run db:up
bun run db:migrate
npm run dev
```

`bun run dev` also works. Open http://localhost:3001; the API runs on port 3000 and Postgres on port 5433. The API dev script loads the root `.env`. If you use a custom database URL, also export `DATABASE_URL` in your shell before running `bun run db:migrate`.

Stop development with Ctrl+C. Use `docker compose stop` to stop Postgres while keeping its data.

### Option 2: Docker images

Install Docker with the Compose plugin; host Bun and Node.js are not required. This uses the existing Dockerfile to build the `fluently-runtime` image and runs Postgres, migrations, API, web and Caddy together.

Change these values in `.env` for container networking and local HTTP:

```dotenv
DATABASE_URL=postgres://impromptu:impromptu@postgres:5432/impromptu
BETTER_AUTH_URL=http://localhost
WEB_ORIGIN=http://localhost
API_URL=http://api:3000
```

Keep ports 80, 443 and 5433 available. Start Postgres first so it is ready for migrations:

```sh
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --wait postgres
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build --wait
```

Open http://localhost. Caddy forwards requests to the web container, which forwards `/api/*` to the API. The startup command applies database migrations automatically. After changing code, rerun the second command to rebuild the image.

```sh
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f api web proxy
docker compose -f docker-compose.yml -f docker-compose.production.yml down
```

Stopping containers preserves database and Caddy volumes. Switch the `.env` values back before returning to development mode.

### First run and troubleshooting

Sign up with an email address you can receive mail at, open the verification link, and set a Goal. Choose a Written Assessment to try the flow without a microphone, confirm your Goals, then start a Lesson from the Roadmap. Voice requires microphone permission; remote access requires HTTPS.

- `Missing env var ...`: fill in the named setting and restart the app. Docker containers must be recreated with the startup command to load changed environment values.
- Database connection refused: check Docker is running and that `DATABASE_URL` matches your chosen mode.
- Missing database relations: rerun migrations in development mode, or inspect the Docker `migrate` service logs.
- No verification email: check Resend sender/recipient restrictions and delivery status.

## Web app

`apps/web` is a TanStack Start React app with TanStack Query and SSR, built from `@fluently/ui`.

The browser only talks to the web app. The web server passes every `/api/*` request through to the
API at `API_URL` (default `http://localhost:3000`), cookies included, so Better Auth cookies are
first-party and no CORS setup is needed.

`WEB_ORIGIN` and `BETTER_AUTH_URL` point at the web origin, because that's where the browser reaches the API.

API reference: http://localhost:3000/docs. The OpenAPI document is served at
http://localhost:3000/docs/openapi.json. Operations are listed from the Hono
routes; request and response schemas are not yet included.

AI endpoints allow 60 requests per minute and four requests in flight per Learner.
Overlapping conversation turns return 409; rate limits return 429 with `Retry-After`.
These guards, like live voice calls, run in one API instance. Shared claims are required before adding API replicas.
Assessments have a server-enforced ten-minute deadline, including reconnects.

For local API metrics, keep `METRICS_ENABLED=true` in the root `.env` and run
`docker compose -f docker-compose.monitoring.yml up -d`. See
[infra/monitoring/README.md](infra/monitoring/README.md) for Grafana access and
dashboard details.

```sh
bun run build
bun run --filter @fluently/web preview
bun run typecheck
bun run --filter @fluently/web test
```

### Deploy on a Linux VM

Install Docker Engine with the Compose plugin and enable Docker at boot. Host Bun is not required.
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
docker compose --env-file .env -f docker-compose.production.yml up -d --build --wait
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
docker run --rm -v "$PWD/scripts/check-deploy.ts:/app/scripts/check-deploy.ts:ro" fluently-runtime bun /app/scripts/check-deploy.ts
```

### How the app is wired

- `apps/web/src/routes/api/$.ts` is the `/api/*` pass-through.
- `apps/web/src/lib/api.ts` exports `api()`, the typed Hono client for `@fluently/api`. During server rendering it
  calls the API directly with the Learner's `cookie` header.
- `apps/web/src/lib/auth.ts` exports `authClient`, Better Auth on the web origin, plus `signUp` (sends the browser's
  timezone) and `signInWithGoogle`. `GET /api/auth/providers` says whether Google is configured.
- `apps/web/src/components/auth/AuthScreen.tsx` is the shared sign-in / sign-up screen. `/goals` sets Goals with Goal Context, and
  `/assessments/new` starts a Voice or Written Assessment (and shows the retake lock).
- `apps/web/src/routes/_signedIn.tsx` guards every route inside `apps/web/src/routes/_signedIn/`: no session redirects to
  `/sign-in`. Home sends Learners who haven't finished onboarding on to set or confirm their Goals.
- `apps/web/src/lib/theme.ts` reads the Light/Dark/System `theme` cookie, rendered as `data-theme` on `<html>`.
- `apps/web/src/router.tsx` creates a QueryClient per server request, keeping Learners' cached data separate.
- Apps never style anything: no `className`, `style` or CSS. Missing pieces go into `@fluently/ui`.

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

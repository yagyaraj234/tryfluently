# Better Auth across `apps/web` and `apps/api`

**Historical research (2026-10-15).** Current implementation uses a same-origin `/api/*` pass-through in `apps/web/src/routes/api/$.ts`; browser auth uses the web origin in `apps/web/src/lib/auth.ts`. The Better Auth instance and session guard live in `apps/api/src/app.ts`. Examples below are the original proposal, not setup instructions. Follow the root [README](../../README.md) and current code for configuration.

Question (issue #5): how does Better Auth work when `apps/web` (TanStack Start) and `apps/api` (Hono on Bun) are separate apps on different origins/ports? This covers cookies and CORS, where the handler lives, session checks in Hono, the Drizzle adapter with the schema in `packages/db`, and Google OAuth.

Researched 2026-10-15 against Better Auth v1.7.10 (source commit `37a75c9`), hono.dev and tanstack.com/start.

## Recommendation

Put the Better Auth instance and handler in **`apps/api`**. The web app is a client of it:

- `apps/api` mounts `auth.handler` at `/api/auth/*`, owns `baseURL`, the Google callback and the session cookie, and uses the Drizzle adapter on the `db` from `packages/db`.
- `apps/web` uses `createAuthClient({ baseURL: API_URL })` in the browser. For SSR route guards it forwards the incoming `cookie` header to the API's `/api/auth/get-session`.
- Locally (`localhost:3000` and `localhost:3001`) this works with no cookie tweaks, because cookies are not isolated by port.
- In production, put both apps on subdomains of one parent domain (`app.example.com`, `api.example.com`) and turn on `crossSubDomainCookies`. Do not put them on unrelated domains: Safari will drop the cookie.

The handler goes in one app only. The Hono RPC routes and the auth routes then share a single origin, a single cookie and a single DB connection.

## 1. Where the auth handler lives

Mount it in Hono:

```ts
// apps/api/src/index.ts
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
```

- The route must match Better Auth's `basePath` (default `/api/auth`) and must be registered before any catch-all route. If the app uses `new Hono().basePath("/api")`, mount it at `/auth/*` instead. Source: https://www.better-auth.com/docs/integrations/hono
- `basePath` defaults to `/api/auth`. Source: https://www.better-auth.com/docs/reference/options

Rejected alternative: mounting the handler in TanStack Start at `src/routes/api/auth/$.ts` with `server.handlers` GET/POST, plus the `tanstackStartCookies()` plugin (which must be the last plugin). Source: https://www.better-auth.com/docs/integrations/tanstack. That fits a web-only app. Here `apps/api` would then have to validate sessions against the web app or read the same DB, and the auth endpoints would sit on a different origin from the RPC API. Use it only if the API is later folded into Start.

## 2. Server config (`apps/api/src/auth.ts`)

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db, schema } from "@impromptu/db";

const WEB_URL = process.env.WEB_URL!; // http://localhost:3000

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,      // http://localhost:3001 (the API)
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [WEB_URL],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  onAPIError: { errorURL: `${WEB_URL}/auth/error` },
  advanced: process.env.COOKIE_DOMAIN
    ? { crossSubDomainCookies: { enabled: true, domain: process.env.COOKIE_DOMAIN } } // "example.com" in prod
    : undefined,
});
```

- `baseURL`: if it is unset, Better Auth reads `BETTER_AUTH_URL` and then falls back to inferring it from the request. The docs recommend setting it explicitly. Source: https://www.better-auth.com/docs/reference/options
- `secret`: read from `BETTER_AUTH_SECRET` (then `AUTH_SECRET`). Production throws if neither is set. Source: https://www.better-auth.com/docs/reference/options
- `trustedOrigins`: by default only `baseURL` is trusted. The web origin must be added or its requests are rejected. Wildcards such as `https://*.example.com` are supported, and the protocol must match exactly. Sources: https://www.better-auth.com/docs/reference/options, https://www.better-auth.com/docs/reference/security
- `emailAndPassword.enabled` defaults to `false`. Source: https://www.better-auth.com/docs/reference/options
- `onAPIError.errorURL` defaults to `${baseURL}/error`, which is the API origin. Point it at the web app. Source: https://github.com/better-auth/better-auth/blob/37a75c95d148e0db4f29f30cabcd2ceb26bc7085/packages/better-auth/src/api/routes/callback.ts#L57-L58

## 3. Cookies

Defaults in source: `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `secure` only when the secure prefix applies (production). `domain` is set only when `crossSubDomainCookies` is enabled. `advanced.defaultCookieAttributes` is spread over these defaults. Source: https://github.com/better-auth/better-auth/blob/37a75c95d148e0db4f29f30cabcd2ceb26bc7085/packages/better-auth/src/cookies/index.ts#L92-L115

- Cookie names follow `${prefix}.${name}`, with the default prefix `better-auth` and the session cookie `session_token`. Source: https://www.better-auth.com/docs/concepts/cookies
- `SameSite=Lax` is the documented default. Source: https://www.better-auth.com/docs/reference/security
- `advanced.useSecureCookies: true` forces `Secure` in every environment. Source: https://www.better-auth.com/docs/concepts/cookies

**Locally (different ports, same host):** "Cookies do not provide isolation by port." A cookie set by `localhost:3001` is also sent to `localhost:3000`. Source: https://www.rfc-editor.org/rfc/rfc6265#section-8.5. The two ports also count as the same site, because a site is the scheme plus the registrable domain and has no port, so `SameSite=Lax` does not block it. Source: https://html.spec.whatwg.org/multipage/browsers.html#sites. No cookie overrides are needed in dev. The browser still treats the requests as cross-origin, so CORS is required (section 4).

**Production on subdomains:** set `advanced.crossSubDomainCookies = { enabled: true, domain: "example.com" }` and host the apps at `app.example.com` and `api.example.com`. Source: https://www.better-auth.com/docs/concepts/cookies. The source throws "baseURL is required when crossSubdomainCookies are enabled" when `domain` is missing and `baseURL` is unset. Source: https://github.com/better-auth/better-auth/blob/37a75c95d148e0db4f29f30cabcd2ceb26bc7085/packages/better-auth/src/cookies/index.ts#L79-L91

**Unrelated domains:** Safari ITP blocks third-party cookies, so the session may not persist. The fixes are a reverse proxy through the frontend's domain or a shared parent domain. Source: https://www.better-auth.com/docs/concepts/cookies

## 4. CORS in Hono

```ts
import { cors } from "hono/cors";

app.use("*", cors({ origin: process.env.WEB_URL!, credentials: true }));
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
// ...RPC routes
```

- Register CORS before the auth route. Use an explicit origin, not `*`, with `credentials: true`, and add the same origin to `trustedOrigins`. Source: https://www.better-auth.com/docs/integrations/hono
- "CORS should be called before the route." `origin` takes a string, an array or a function. `allowHeaders` and `exposeHeaders` default to empty lists. Source: https://hono.dev/docs/middleware/builtin/cors
- The Better Auth docs scope CORS to `/api/auth/*`. Use `"*"` here, because the Hono RPC routes are also called cross-origin with cookies.

## 5. Session checks in Hono middleware

```ts
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

type Env = { Variables: { session: typeof auth.$Infer.Session | null } };

export const sessionMiddleware = createMiddleware<Env>(async (c, next) => {
  c.set("session", await auth.api.getSession({ headers: c.req.raw.headers }));
  await next();
});

export const requireAuth = createMiddleware<Env>(async (c, next) => {
  if (!c.get("session")) throw new HTTPException(401);
  await next();
});
```

Pattern and types from https://www.better-auth.com/docs/integrations/hono. `auth.api.getSession` takes `c.req.raw.headers` in Hono. Source: https://www.better-auth.com/docs/basic-usage. Typing the app with `Variables` keeps `c.get("session")` typed through to the Hono RPC `AppType`.

## 6. Clients in `apps/web`

Better Auth client:

```ts
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient({ baseURL: import.meta.env.VITE_API_URL }); // http://localhost:3001
```

- When the server is on another domain, pass its base URL to `createAuthClient`. Source: https://www.better-auth.com/docs/concepts/client
- The client sends `credentials: "include"` by default wherever `Request` supports it. Sources: https://www.better-auth.com/docs/integrations/hono and https://github.com/better-auth/better-auth/blob/37a75c95d148e0db4f29f30cabcd2ceb26bc7085/packages/better-auth/src/client/config.ts#L60-L89

Hono RPC client:

```ts
const api = hc<AppType>(import.meta.env.VITE_API_URL, { init: { credentials: "include" } });
```

- Without `init.credentials: "include"`, cross-origin RPC calls carry no cookie. Sources: https://hono.dev/docs/guides/rpc, https://www.better-auth.com/docs/integrations/hono

**SSR route guards (TanStack Start):** a server function cannot use the browser cookie jar, so it forwards the incoming request's `cookie` header to the API:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const res = await fetch(`${process.env.API_URL}/api/auth/get-session`, {
    headers: { cookie: getRequestHeader("cookie") ?? "" },
  });
  return res.ok ? res.json() : null;
});
```

- Server functions run only on the server, and `getRequest()` / `getRequestHeader(name)` come from `@tanstack/react-start/server`. Source: https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
- `/get-session` is the Better Auth session endpoint. Source: https://github.com/better-auth/better-auth/blob/37a75c95d148e0db4f29f30cabcd2ceb26bc7085/packages/better-auth/src/api/routes/session.ts#L31
- Use it in `beforeLoad` and redirect to `/login` when it returns `null`, the same guard pattern as Better Auth's TanStack guide (that guide calls `auth.api.getSession` directly because the handler is in-app there). Source: https://www.better-auth.com/docs/integrations/tanstack
- The web server receives the cookie because it is shared across ports locally (RFC 6265 §8.5) and across subdomains in production (`crossSubDomainCookies`).
- Do not add `tanstackStartCookies()` in this setup. It is for when Start runs the Better Auth server itself. Source: https://www.better-auth.com/docs/integrations/tanstack

## 7. Drizzle adapter and schema in `packages/db`

- Adapter: `drizzleAdapter(db, { provider: "pg" })`, imported from `@better-auth/drizzle-adapter`. Pass the Drizzle schema with `schema`. Set `usePlural: true` if every table name is plural. Source: https://www.better-auth.com/docs/adapters/drizzle. `better-auth` also re-exports it as `better-auth/adapters/drizzle` and depends on `@better-auth/drizzle-adapter`. Source: https://github.com/better-auth/better-auth/blob/37a75c95d148e0db4f29f30cabcd2ceb26bc7085/packages/better-auth/package.json
- Generate the tables with `npx auth@latest generate`, then `npx drizzle-kit generate` and `npx drizzle-kit migrate`. Source: https://www.better-auth.com/docs/adapters/drizzle
- `generate` accepts `--config <path>` (the auth config, here `apps/api/src/auth.ts`) and `--output <file>`, so it can write straight to `packages/db/src/schema/auth.ts`: `npx auth@latest generate --config apps/api/src/auth.ts --output packages/db/src/schema/auth.ts`. Source: https://github.com/better-auth/better-auth/blob/37a75c95d148e0db4f29f30cabcd2ceb26bc7085/packages/cli/src/commands/generate.ts#L371-L392
- `packages/db` then exports `db` and `schema` (including the generated `user`, `session`, `account` and `verification` tables), and the existing Drizzle Kit config in `packages/db` owns migrations for both app and auth tables.
- Renaming: keep the schema key and change the column name (for example `varchar("email_address")`), or map it with `user.fields` / `modelName` in the auth config. Joins need `advanced.database.joins: true` plus relations passed through `schema` (v1.4.0+). Source: https://www.better-auth.com/docs/adapters/drizzle

## 8. Google OAuth

- Redirect URI registered in Google Cloud Console: `<baseURL>/api/auth/callback/google`. The docs show `http://localhost:3000/...` because their server is the web app. Here `baseURL` is the API, so register **`http://localhost:3001/api/auth/callback/google`** and `https://api.example.com/api/auth/callback/google`. Source: https://www.better-auth.com/docs/authentication/google. The redirect URI is composed as `ctx.context.baseURL + callbackPath`. Source: https://github.com/better-auth/better-auth/blob/37a75c95d148e0db4f29f30cabcd2ceb26bc7085/packages/core/src/oauth2/oauth-provider.ts#L146-L158
- Set `baseURL` (or `BETTER_AUTH_URL`) to avoid `redirect_uri_mismatch`. Source: https://www.better-auth.com/docs/authentication/google
- Google issues a refresh token only on first consent. If one is needed every time, use `accessType: "offline"` and `prompt: "select_account consent"`. Source: https://www.better-auth.com/docs/authentication/google
- From the web app: `authClient.signIn.social({ provider: "google", callbackURL: \`${WEB_URL}/dashboard\` })`. Options include `callbackURL`, `errorCallbackURL` and `newUserCallbackURL`. Source: https://www.better-auth.com/docs/basic-usage
- **Use absolute web URLs for `callbackURL`.** The OAuth callback runs on the API and finishes with `c.redirect(callbackURL)`. A relative `/dashboard` would resolve against the API origin. Source: https://github.com/better-auth/better-auth/blob/37a75c95d148e0db4f29f30cabcd2ceb26bc7085/packages/better-auth/src/api/routes/callback.ts#L258-L331. `callbackURL` is validated against `trustedOrigins`, which is another reason to add `WEB_URL` there. Sources: https://github.com/better-auth/better-auth/blob/37a75c95d148e0db4f29f30cabcd2ceb26bc7085/packages/better-auth/src/api/middlewares/origin-check.ts#L64-L147, https://www.better-auth.com/docs/reference/security

## Env checklist

| Var | App | Local value |
| --- | --- | --- |
| `BETTER_AUTH_URL` | api | `http://localhost:3001` |
| `BETTER_AUTH_SECRET` | api | random 32+ chars |
| `WEB_URL` | api | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | api | from Google Cloud Console |
| `COOKIE_DOMAIN` | api | unset (prod: `example.com`) |
| `VITE_API_URL` | web (client) | `http://localhost:3001` |
| `API_URL` | web (server) | `http://localhost:3001` |

## Open points

- Simpler alternative for production: a reverse proxy that serves the API under the web origin (`app.example.com/api`). This removes CORS and cross-subdomain cookies entirely and is Better Auth's documented fix for Safari ITP (https://www.better-auth.com/docs/concepts/cookies). Choose it when the hosting is decided.
- Neon later changes only the `db` driver in `packages/db`. The adapter config stays `provider: "pg"`.

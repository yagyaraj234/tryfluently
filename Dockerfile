FROM oven/bun:1.4.3 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json

FROM dependencies AS build
RUN bun install --frozen-lockfile
COPY . .
RUN bun --bun run --filter @impromptu/web build

FROM dependencies AS runtime
RUN bun install --frozen-lockfile --production
COPY apps/api/src apps/api/src
COPY packages/db/src packages/db/src
COPY packages/db/migrations packages/db/migrations
COPY scripts/migrate.ts scripts/migrate.ts
COPY apps/web/server.ts apps/web/server.ts
COPY --from=build /app/apps/web/dist apps/web/dist
ENV NODE_ENV=production
USER bun
WORKDIR /app/apps/web
CMD ["bun", "server.ts"]

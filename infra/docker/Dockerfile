# Multi-target image for the monorepo (build context = repo root).
#   target "api"        → distributor-api / order-api   (ARG APP)
#   target "web"        → distributor-web / order-web   (ARG APP), served by nginx
#   target "simulator"  → producer / customer simulator CLI
FROM docker.io/library/node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/x12/package.json packages/x12/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/simulator/package.json apps/simulator/
COPY apps/distributor-web/package.json apps/distributor-web/
COPY apps/order-web/package.json apps/order-web/
COPY apps/distributor-api/package.json apps/distributor-api/
COPY apps/distributor-api/prisma apps/distributor-api/prisma
COPY apps/order-api/package.json apps/order-api/
COPY apps/order-api/prisma apps/order-api/prisma
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------- api
FROM deps AS api
ARG APP
ENV APP=${APP} NODE_ENV=production
COPY packages packages
COPY apps/${APP} apps/${APP}
RUN npx prisma generate --schema apps/${APP}/prisma/schema.prisma
# Schema is synced on start (simulator project: no migration history needed).
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss --schema apps/$APP/prisma/schema.prisma && exec npx tsx apps/$APP/src/index.ts"]

# ---------------------------------------------------------------- web
FROM deps AS web-build
ARG APP
COPY packages packages
COPY apps/${APP} apps/${APP}
RUN npm run build -w @edi/${APP}

FROM docker.io/library/nginx:1.27-alpine AS web
ARG APP
COPY infra/nginx/${APP}.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /repo/apps/${APP}/dist /usr/share/nginx/html

# ---------------------------------------------------------------- simulator
FROM deps AS simulator
COPY packages packages
COPY apps/simulator apps/simulator
ENV SIM_OUT_DIR=/data
ENTRYPOINT ["npx", "tsx", "apps/simulator/src/cli.ts"]
CMD ["help"]

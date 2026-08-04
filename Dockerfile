# syntax=docker/dockerfile:1

# One image: the Hono API serving the built SPA. The hosted instance and every
# self-hoster run this same thing, on Node 22.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/crypto/package.json packages/crypto/

FROM manifests AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM manifests AS production-deps
RUN pnpm install --frozen-lockfile --prod --filter @securesend/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=production-deps /app/node_modules /app/node_modules
COPY --from=production-deps /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build /app/apps/api/dist dist
COPY --from=build /app/apps/web/dist public
COPY apps/api/drizzle drizzle
# The licence travels with the software, because the image is the software.
COPY LICENSE /app/LICENSE
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/index.js"]

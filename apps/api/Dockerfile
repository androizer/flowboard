FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN yarn install --frozen-lockfile || yarn install
COPY . .
RUN yarn workspace @flowboard/api prisma:generate && yarn workspace @flowboard/api build

FROM node:22-alpine AS production-dependencies
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
COPY apps/web/package.json apps/web/package.json
# Prisma and tsx are production dependencies because migration and the idempotent
# seed execute at API container startup. Build tools (Nest CLI, Nx, Vite, tsc)
# remain in the builder stage only.
RUN yarn install --production=true --frozen-lockfile && yarn cache clean

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules ./node_modules
# `@prisma/client` loads generated code from this directory at runtime. It is
# generated against the Linux image in the builder stage, not on the host.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/scripts ./scripts
CMD ["sh", "-c", "node scripts/init-signing-secret.js && cd apps/api && ../../node_modules/.bin/prisma migrate deploy && ../../node_modules/.bin/tsx prisma/seed.ts && node dist/main.js"]

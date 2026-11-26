# Multi-stage Dockerfile for Uptime (Next.js + Prisma + Redis Producer/Worker)
FROM oven/bun:1-alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY redis/package.json redis/bun.lock ./redis/
RUN bun install --frozen-lockfile && cd redis && bun install --frozen-lockfile

FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/redis/node_modules ./redis/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/uptime"
ENV JWT_SECRET="docker-build-placeholder-secret"
RUN bunx prisma generate
RUN bun run build

FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/dbConnection.ts ./
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/producer.ts ./
COPY --from=builder /app/worker.ts ./
COPY --from=builder /app/redis ./redis
COPY --from=builder /app/tsconfig.json ./

EXPOSE 3000
CMD ["bun", "run", "start"]

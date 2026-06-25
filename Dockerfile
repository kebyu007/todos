# ---- Build stage: install all deps, compile TypeScript, prune to prod ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# argon2 is a native module; it needs build tools to compile during install.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# pnpm via corepack (matches the repo's pnpm-lock.yaml v9 / pnpm 10).
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

# Install dependencies first (better layer caching).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build the app.
COPY . .
RUN pnpm build

# Drop dev dependencies so we copy a lean node_modules into the runtime image.
RUN pnpm prune --prod

# ---- Runtime stage: just Node + the built app ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# main.ts reads ../views and ../public relative to dist/, so they must sit
# next to the dist folder at runtime.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/views ./views
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

EXPOSE 5000
CMD ["node", "dist/main"]

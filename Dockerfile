# Buffett Bracket — self-hosted runtime
# Multi-stage: build the bundle, then ship a lean runtime image.

# ---------- Stage 1: build the client + server bundle ----------
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3 needs build tools to compile native bindings
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- Stage 2: install production-only deps ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 build-essential \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------- Stage 3: lean runtime ----------
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# Persistent SQLite lives at /app/data — mount a volume here
RUN mkdir -p /app/data
VOLUME ["/app/data"]
# The app reads/writes data.db relative to the working directory
WORKDIR /app/data

EXPOSE 5000
CMD ["node", "/app/dist/index.cjs"]

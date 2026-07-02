# syntax=docker/dockerfile:1

# ── Stage 1: runtime base ──────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS base

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        python3-pip \
        libopus0 \
        libsodium23 \
        libpixman-1-0 \
        libcairo2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libjpeg62-turbo \
        libgif7 \
        librsvg2-2

RUN pip3 install --no-cache-dir edge-tts --break-system-packages

# ── Stage 2: install deps ──────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        python3-dev \
        pkg-config \
        libopus-dev \
        libpixman-1-dev \
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg-dev \
        libgif-dev \
        librsvg2-dev

# Must set BEFORE any npm command — applies to npm install -g too
ENV NODE_OPTIONS="--max-old-space-size=3072"

# npm 11 uses far less memory than npm 10 on constrained hosts
RUN npm install -g npm@11 --no-fund --no-audit

COPY package.json package-lock.json* ./

# npm install (not ci) — lower peak memory, still respects lockfile
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm install --omit=dev --no-fund --no-audit

# ── Stage 3: production image ──────────────────────────────────────────────────
FROM base AS runtime
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY . .

RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "/app/index.js"]

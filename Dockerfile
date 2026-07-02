# syntax=docker/dockerfile:1
# ↑ Enables BuildKit cache mounts — apt & npm packages are cached between builds
#   so only changed layers re-run. First build is full; every push after is fast.

# ── Stage 1: shared runtime base ───────────────────────────────────────────────
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

# ── Stage 2: build native Node addons ─────────────────────────────────────────
# Build tools + *-dev headers stay here — never land in the final image.
FROM base AS deps
WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        python3-dev \
        pkg-config \
        cmake \
        libopus-dev \
        libsodium-dev \
        libpixman-1-dev \
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg-dev \
        libgif-dev \
        librsvg2-dev

COPY package.json package-lock.json* ./

# --mount=type=cache keeps downloaded tarballs across builds → huge speed win
# NODE_OPTIONS prevents OOM crash from heavy native packages (sharp, @napi-rs/canvas)
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    NODE_OPTIONS="--max-old-space-size=4096" \
    npm ci --omit=dev --no-fund --no-audit

# ── Stage 3: lean production image ────────────────────────────────────────────
FROM base AS runtime
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY . .

RUN mkdir -p /app/data && chmod 755 /app/data

ENV NODE_ENV=production

# Render injects PORT; 10000 is the default for Docker services
EXPOSE 10000

CMD ["node", "/app/index.js"]

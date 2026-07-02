# ── Stage 1: shared runtime base ───────────────────────────────────────────────
# Only runtime shared libraries — no *-dev headers, no build toolchain.
FROM node:22-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    # Opus runtime (voice encoding/decoding)
    libopus0 \
    # libsodium runtime (encryption for @discordjs/voice)
    libsodium23 \
    # @napi-rs/canvas runtime shared libs
    libpixman-1-0 \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    && pip3 install --no-cache-dir edge-tts --break-system-packages \
    && rm -rf /var/lib/apt/lists/*

# ── Stage 2: build dependencies (native addon compilation) ─────────────────────
# Inherits runtime libs from base, adds build toolchain on top.
# These build packages are NOT copied into the final runtime image.
FROM base AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    pkg-config \
    cmake \
    # Header files needed to compile native addons against system libs
    libopus-dev \
    libsodium-dev \
    libpixman-1-dev \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-fund --no-audit

# ── Stage 3: lean production image ────────────────────────────────────────────
FROM base AS runtime
WORKDIR /app

# Copy compiled node_modules from the build stage (no toolchain included)
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY package.json package-lock.json* ./
COPY . .

# Ensure writable data directory exists (used for cache, temp audio files, etc.)
RUN mkdir -p /app/data && chmod 755 /app/data

ENV NODE_ENV=production

# Render routes external traffic to port 10000 for Docker services
EXPOSE 10000

CMD ["node", "/app/index.js"]

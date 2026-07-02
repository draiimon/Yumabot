FROM node:22-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    libopus-dev \
    libsodium-dev \
    && pip3 install --no-cache-dir edge-tts --break-system-packages \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-fund --no-audit

FROM base AS runtime
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY . .

ENV NODE_ENV=production

EXPOSE 10000

CMD ["node", "/app/index.js"]

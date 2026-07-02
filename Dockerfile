FROM node:22-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    libopus-dev \
    libsodium-dev \
    libfontconfig1 \
    && pip3 install --no-cache-dir edge-tts --break-system-packages \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-fund --no-audit \
    # prism-media optionally depends on ffmpeg-static, but we use system ffmpeg
    && rm -rf /app/node_modules/ffmpeg-static

FROM base AS runtime
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY . .

RUN mkdir -p /app/data \
    && chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV FFMPEG_PATH=ffmpeg

EXPOSE 10000

CMD ["node", "--max-old-space-size=384", "--expose-gc", "/app/index.js"]

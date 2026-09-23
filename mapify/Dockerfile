FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=10000 HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data PYTHON_PATH=/opt/youtube/bin/python NODE_OPTIONS=--disable-warning=ExperimentalWarning
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN python3 -m venv /opt/youtube && /opt/youtube/bin/pip install --no-cache-dir -r requirements.txt \
    && groupadd --system app && useradd --system --gid app app && mkdir -p /app/data && chown app:app /app/data
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY scripts/transcript.py ./scripts/transcript.py
USER app
VOLUME ["/app/data"]
EXPOSE 10000
CMD ["node", "server.js"]

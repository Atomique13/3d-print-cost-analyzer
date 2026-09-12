# syntax=docker/dockerfile:1
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Source edits reuse this layer; npm's download cache stays out of the image.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# Only runtime files belong in the published image.
COPY server.js data-model.js index.html login.html script.js styles.css ./
COPY data/data.json.example ./data/data.json.example

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 80) + '/login.html', {signal: AbortSignal.timeout(4000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Node receives container stop signals directly.
CMD ["node", "server.js"]

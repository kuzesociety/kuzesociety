# SIGNAL — 24/7 meme-coin radar + trading bot (see signal/README.md)
FROM node:22-alpine AS build
WORKDIR /app
COPY signal/package.json signal/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY signal/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8787 SIGNAL_SUPERVISED=1
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 8787
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
CMD ["node", "dist/engine.mjs"]

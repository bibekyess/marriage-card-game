# syntax=docker/dockerfile:1

# ---- build stage: install all deps, produce dist/ ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Server bundle always; client bundle only once src/client exists.
RUN if [ -f src/client/index.html ]; then npm run build; else npm run build:server; fi

# ---- runtime stage: prod deps + built output only ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Layout matters: server serves the client from dist/client (next to dist/server.js).
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "dist/server.js"]

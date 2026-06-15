# ── Stage 1: Build React frontend ─────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
RUN npm install -g yarn
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY frontend/ .
RUN yarn build

# ── Stage 2: Compile TypeScript backend ───────────────────────────────────────
FROM node:20-alpine AS backend-builder
WORKDIR /app
RUN npm install -g yarn
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn tsc

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
RUN npm install -g yarn

# Production deps only
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

# Compiled backend
COPY --from=backend-builder /app/dist ./dist

# Built frontend (served as static files by Express)
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Merchant snapshot data (anonymized demo merchants)
COPY data/ ./data/

EXPOSE 3001
ENV NODE_ENV=production

# Healthcheck — Alibaba Cloud load balancer / ECS can use this
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "dist/server.js"]

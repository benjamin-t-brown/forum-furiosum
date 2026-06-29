# Stage 1: Build
FROM node:24-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN corepack npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN corepack npm exec tsc

# Stage 2: Production
FROM node:24-alpine AS runner

RUN corepack enable

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json .npmrc ./
RUN corepack npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY src/views ./src/views
COPY public ./public

EXPOSE 9827

CMD ["node", "dist/index.js"]

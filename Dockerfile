# Signal Trade Platform - Railway Deployment
FROM oven/bun:1.1-alpine AS base

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY package.json bun.lockb* ./
COPY web/package.json ./web/

# Install root dependencies
RUN bun install --frozen-lockfile || bun install

# Install web dependencies
WORKDIR /app/web
RUN bun install --frozen-lockfile || bun install

# Build Next.js app
WORKDIR /app
COPY . .

WORKDIR /app/web
RUN bun run build

# Production stage
FROM oven/bun:1.1-alpine AS production

WORKDIR /app

# Install runtime dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy from build stage
COPY --from=base /app /app

# Environment
ENV NODE_ENV=production
ENV PORT=3460
ENV FEED_PORT=3462

# Expose ports
EXPOSE 3460 3462 3000

# Start all services
CMD ["bun", "run", "start:prod"]

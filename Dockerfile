# Signal Trade Platform - API Server
FROM oven/bun:1.1-alpine

WORKDIR /app

# Install dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

# Environment
ENV NODE_ENV=production

# Railway provides PORT env var
EXPOSE ${PORT:-3460}

# Start API server
CMD ["bun", "run", "api/server.ts"]

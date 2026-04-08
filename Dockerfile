# Signal Trade Platform - Full Stack
FROM oven/bun:1.1-alpine AS base

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++ nodejs npm

# Copy root package files
COPY package.json bun.lockb* ./

# Install root dependencies
RUN bun install

# Copy web package files and install
COPY web/package.json ./web/
WORKDIR /app/web
RUN npm install

# Copy all source code
WORKDIR /app
COPY . .

# Build Next.js
WORKDIR /app/web
RUN npm run build

# Production stage
FROM oven/bun:1.1-alpine

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache python3 make g++ nodejs npm

# Copy everything from build stage
COPY --from=base /app /app

# Create data directory
RUN mkdir -p /app/data

ENV NODE_ENV=production

# Start script will handle both services
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 3000

CMD ["/app/start.sh"]

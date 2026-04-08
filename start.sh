#!/bin/sh

# Start API server in background on internal port
PORT=3460 bun run api/server.ts &

# Wait for API to be ready
sleep 3

# Start Next.js on Railway's PORT (defaults to 3000)
cd /app/web
PORT=${PORT:-3000} npm run start

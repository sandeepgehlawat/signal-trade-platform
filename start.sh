#!/bin/sh

# Start API server in background on internal port
echo "Starting API server on port 3460..."
PORT=3460 bun run api/server.ts &
API_PID=$!

# Wait for API to be ready (up to 30 seconds)
echo "Waiting for API to be ready..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3460/health > /dev/null 2>&1; then
    echo "API is ready!"
    break
  fi
  sleep 1
done

# Start Next.js on Railway's PORT
cd /app/web
echo "Starting Next.js on port ${PORT:-3000}..."
exec npm run start

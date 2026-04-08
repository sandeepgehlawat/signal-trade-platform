#!/bin/sh

# Save Railway's PORT for Next.js (default 3000 for local dev)
NEXTJS_PORT=${PORT:-3000}
echo "=== Signal Trade Platform Startup ==="
echo "Railway PORT env: $PORT"
echo "Next.js will use PORT: $NEXTJS_PORT"

# Start Feed server in background (internal port only)
echo "Starting Feed server on port 3462..."
FEED_PORT=3462 bun run feed/server.ts &

# Start API server in background on internal port 3460
# Unset PORT to prevent confusion, use explicit API_PORT
echo "Starting API server on port 3460..."
API_PORT=3460 FEED_SERVER_URL=http://localhost:3462 bun run api/server.ts &

# Wait for API to be ready (up to 30 seconds)
echo "Waiting for API to be ready..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3460/health > /dev/null 2>&1; then
    echo "API is ready!"
    break
  fi
  sleep 1
done

# Start Next.js on the external PORT
# Export PORT explicitly for Next.js
cd /app/web
export PORT=$NEXTJS_PORT
echo "Starting Next.js on port $PORT (exported)..."
echo "Current directory: $(pwd)"
echo "Running: npm run start"
exec npm run start

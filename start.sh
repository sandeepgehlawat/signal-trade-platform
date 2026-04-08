#!/bin/sh

# Railway assigns PORT for external traffic
NEXTJS_PORT=${PORT:-3000}
echo "=== Signal Trade Platform Startup ==="
echo "Railway PORT: $PORT"
echo "Next.js port: $NEXTJS_PORT"

# Start background services first (they use different ports)
cd /app

echo "Starting Feed server on port 3462..."
FEED_PORT=3462 bun run feed/server.ts &

echo "Starting API server on port 3460..."
API_PORT=3460 FEED_SERVER_URL=http://localhost:3462 bun run api/server.ts &

# Give services a moment to start
sleep 2

# Start Next.js on Railway's PORT (this is the main process)
cd /app/web
export PORT=$NEXTJS_PORT
export HOSTNAME="0.0.0.0"

echo "Starting Next.js on port $PORT..."
exec npm run start

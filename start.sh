#!/bin/sh

# Railway assigns PORT for external traffic - Next.js MUST use this
NEXTJS_PORT=${PORT:-3000}
echo "=== Signal Trade Platform Startup ==="
echo "Railway PORT env: $PORT"
echo "Next.js will bind to: $NEXTJS_PORT"

# IMPORTANT: Start Next.js FIRST so Railway detects the correct port
# Background services start AFTER to avoid port detection issues

cd /app/web
export PORT=$NEXTJS_PORT
export HOSTNAME="0.0.0.0"

echo "Starting Next.js on port $PORT (Railway's external port)..."

# Check if standalone build exists
if [ -d ".next/standalone" ]; then
  echo "Using standalone server..."
  cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
  cp -r public .next/standalone/ 2>/dev/null || true
  cd .next/standalone
  # Start Next.js in background first, then start other services
  node server.js &
  NEXTJS_PID=$!
  echo "Next.js started with PID $NEXTJS_PID"
else
  echo "Using npm start..."
  npm run start &
  NEXTJS_PID=$!
  echo "Next.js started with PID $NEXTJS_PID"
fi

# Wait for Next.js to be ready (Railway needs to see this port first)
echo "Waiting for Next.js to be ready on port $NEXTJS_PORT..."
for i in $(seq 1 30); do
  if curl -s "http://localhost:$NEXTJS_PORT" > /dev/null 2>&1; then
    echo "Next.js is ready!"
    break
  fi
  sleep 1
done

# Now start background services on internal ports
cd /app

echo "Starting Feed server on internal port 3462..."
FEED_PORT=3462 bun run feed/server.ts &

echo "Starting API server on internal port 3460..."
API_PORT=3460 FEED_SERVER_URL=http://localhost:3462 bun run api/server.ts &

# Wait for API to be ready
echo "Waiting for API to be ready..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3460/health > /dev/null 2>&1; then
    echo "API is ready!"
    break
  fi
  sleep 1
done

echo "=== All services started ==="
echo "  Next.js: port $NEXTJS_PORT (external)"
echo "  API:     port 3460 (internal)"
echo "  Feed:    port 3462 (internal)"

# Keep the main process running by waiting for Next.js
wait $NEXTJS_PID

/**
 * Health check endpoint for Railway
 * This is handled directly by Next.js, not proxied to API server
 */
export async function GET() {
  return Response.json({
    status: "ok",
    service: "nextjs",
    timestamp: new Date().toISOString(),
  });
}

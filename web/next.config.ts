import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy API calls to internal servers
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL || "http://localhost:3460";
    const feedUrl = process.env.INTERNAL_FEED_URL || "http://localhost:3462";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/:path*`,
      },
      // Auth, trades, keys etc go to API server
      {
        source: "/auth/:path*",
        destination: `${apiUrl}/auth/:path*`,
      },
      {
        source: "/trades",
        destination: `${apiUrl}/trades`,
      },
      {
        source: "/trades/:path*",
        destination: `${apiUrl}/trades/:path*`,
      },
      {
        source: "/keys",
        destination: `${apiUrl}/keys`,
      },
      {
        source: "/keys/:path*",
        destination: `${apiUrl}/keys/:path*`,
      },
      {
        source: "/payments/:path*",
        destination: `${apiUrl}/payments/:path*`,
      },
      {
        source: "/stats",
        destination: `${apiUrl}/stats`,
      },
      // Note: /health is handled by Next.js directly (app/health/route.ts)
      // This allows Railway healthcheck to work before API server starts
      {
        source: "/subscribe",
        destination: `${apiUrl}/subscribe`,
      },
      {
        source: "/subscribe/:path*",
        destination: `${apiUrl}/subscribe/:path*`,
      },
      {
        source: "/news",
        destination: `${apiUrl}/news`,
      },
      {
        source: "/mock-trades",
        destination: `${apiUrl}/mock-trades`,
      },
      {
        source: "/signals",
        destination: `${apiUrl}/signals`,
      },
      {
        source: "/signals/:path*",
        destination: `${apiUrl}/signals/:path*`,
      },
      {
        source: "/process",
        destination: `${apiUrl}/process`,
      },
      // Feed server (SSE streaming)
      {
        source: "/feed/:path*",
        destination: `${feedUrl}/feed/:path*`,
      },
    ];
  },
};

export default nextConfig;

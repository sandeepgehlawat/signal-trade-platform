import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy API calls to internal Bun server
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL || "http://localhost:3460";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/:path*`,
      },
      // Also proxy auth, trades, keys, etc directly
      {
        source: "/auth/:path*",
        destination: `${apiUrl}/auth/:path*`,
      },
      {
        source: "/trades/:path*",
        destination: `${apiUrl}/trades/:path*`,
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
      {
        source: "/health",
        destination: `${apiUrl}/health`,
      },
      {
        source: "/subscribe/:path*",
        destination: `${apiUrl}/subscribe/:path*`,
      },
      {
        source: "/signals/:path*",
        destination: `${apiUrl}/signals/:path*`,
      },
      {
        source: "/feed/:path*",
        destination: `${apiUrl}/feed/:path*`,
      },
      {
        source: "/process",
        destination: `${apiUrl}/process`,
      },
    ];
  },
};

export default nextConfig;

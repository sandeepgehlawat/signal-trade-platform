#!/usr/bin/env bun
/**
 * Signal Trade - Feed Server
 *
 * SSE server for broadcasting trade signals to subscribers
 *
 * Endpoints:
 *   GET /feed/subscribe  - SSE stream (requires API key)
 *   GET /feed/health     - Health check
 *
 * Authentication:
 *   Header: Authorization: Bearer <api_key>
 */

import type { FeedEvent, ApiKeyTier } from "../types";
import {
  validateApiKey,
  trackConnection,
  removeConnection,
  type ValidatedKey,
} from "./keys";
import {
  addSubscriber,
  removeSubscriber,
  getSubscriberCount,
  getSubscribersByTier,
  publishSignal,
} from "./publisher";
import type { TradePost } from "../types";
import { randomBytes, timingSafeEqual } from "crypto";

const FEED_PORT = parseInt(process.env.FEED_PORT || "3462");
const INTERNAL_SECRET = process.env.FEED_INTERNAL_SECRET || "dev_secret_change_in_prod";

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3460",
  "http://localhost:3462",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3460",
];

const ALLOWED_ORIGINS = new Set(
  process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : DEFAULT_ALLOWED_ORIGINS
);

const CORS_DEV_MODE = process.env.NODE_ENV !== "production";

function getCorsOrigin(req: Request): string {
  const origin = req.headers.get("Origin");
  if (CORS_DEV_MODE && origin) return origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  return DEFAULT_ALLOWED_ORIGINS[0];
}

// Request context for CORS
let currentRequest: Request | null = null;

// Constant-time string comparison to prevent timing attacks
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const bufA = Buffer.from(a);
    timingSafeEqual(bufA, bufA); // Maintain constant time even on length mismatch
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

function extractApiKey(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const [scheme, key] = authHeader.split(" ");
  if (scheme !== "Bearer" || !key) return null;

  return key;
}

function validateRequest(req: Request): { key: ValidatedKey } | { error: string; status: number } {
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    return { error: "Missing Authorization header", status: 401 };
  }

  const validatedKey = validateApiKey(apiKey);
  if (!validatedKey) {
    return { error: "Invalid or expired API key", status: 401 };
  }

  return { key: validatedKey };
}

// ============================================================================
// IP-BASED CONNECTION LIMITS (DoS protection)
// ============================================================================

const MAX_CONNECTIONS_PER_IP = 10;
const ipConnections = new Map<string, Set<string>>(); // IP -> Set of connectionIds

function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
}

function trackIpConnection(ip: string, connectionId: string): boolean {
  if (!ipConnections.has(ip)) {
    ipConnections.set(ip, new Set());
  }
  const connections = ipConnections.get(ip)!;

  if (connections.size >= MAX_CONNECTIONS_PER_IP) {
    return false;
  }

  connections.add(connectionId);
  return true;
}

function removeIpConnection(ip: string, connectionId: string): void {
  const connections = ipConnections.get(ip);
  if (connections) {
    connections.delete(connectionId);
    if (connections.size === 0) {
      ipConnections.delete(ip);
    }
  }
}

// ============================================================================
// SSE ENDPOINT
// ============================================================================

function createSseResponse(req: Request, key: ValidatedKey): Response {
  const connectionId = `conn_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const corsOrigin = getCorsOrigin(req);
  const clientIp = getClientIp(req);

  // Check IP-based connection limit first (DoS protection)
  if (!trackIpConnection(clientIp, connectionId)) {
    console.warn(`[feed] IP ${clientIp} exceeded connection limit`);
    return new Response(
      JSON.stringify({
        error: "Too many connections from this IP",
        limit: MAX_CONNECTIONS_PER_IP,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Credentials": "true",
        },
      }
    );
  }

  // Check connection limit
  if (!trackConnection(key.userId, connectionId, key.tier)) {
    return new Response(
      JSON.stringify({
        error: "Connection limit reached",
        limit: key.limits.connections,
        tier: key.tier,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Credentials": "true",
        },
      }
    );
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: FeedEvent) => {
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch (e) {
          console.error("[feed] Failed to send event:", e);
        }
      };

      // Send connected event
      sendEvent({
        type: "connected",
        data: {
          connection_id: connectionId,
          tier: key.tier,
          delay_ms: key.limits.delayMs,
          message: key.tier === "paid" ? "Real-time feed" : "5 minute delayed feed",
        },
        timestamp: new Date().toISOString(),
      });

      // Register subscriber
      addSubscriber({
        id: connectionId,
        userId: key.userId,
        tier: key.tier,
        callback: sendEvent,
        connectedAt: Date.now(),
      });

      console.log(`[feed] New connection: ${connectionId} (user: ${key.userId}, tier: ${key.tier})`);
    },
    cancel() {
      // Clean up on disconnect
      removeSubscriber(connectionId);
      removeConnection(key.userId, connectionId);
      removeIpConnection(clientIp, connectionId);
      console.log(`[feed] Connection closed: ${connectionId}`);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Headers": "Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

// ============================================================================
// HTTP HANDLERS
// ============================================================================

function jsonResponse(data: unknown, status = 200): Response {
  const origin = currentRequest ? getCorsOrigin(currentRequest) : DEFAULT_ALLOWED_ORIGINS[0];
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

async function handleRequest(req: Request): Promise<Response> {
  currentRequest = req;
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === "OPTIONS") {
    const origin = getCorsOrigin(req);
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Internal-Secret",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Health check
  if (method === "GET" && path === "/feed/health") {
    const tiers = getSubscribersByTier();
    return jsonResponse({
      status: "ok",
      subscribers: getSubscriberCount(),
      subscribers_by_tier: tiers,
      timestamp: new Date().toISOString(),
    });
  }

  // Subscribe to feed
  if (method === "GET" && path === "/feed/subscribe") {
    const validation = validateRequest(req);

    if ("error" in validation) {
      return jsonResponse({ error: validation.error }, validation.status);
    }

    return createSseResponse(req, validation.key);
  }

  // Internal publish endpoint (called by API server)
  // Protected by internal secret to prevent unauthorized signal injection
  if (method === "POST" && path === "/feed/publish") {
    const internalSecret = req.headers.get("X-Internal-Secret");
    if (!internalSecret || !safeCompare(internalSecret, INTERNAL_SECRET)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    try {
      const body = await req.json() as TradePost;
      publishSignal(body);
      return jsonResponse({ success: true, subscribers: getSubscriberCount() });
    } catch (e) {
      return jsonResponse({ error: String(e) }, 400);
    }
  }

  return jsonResponse({ error: "Not found", server: "feed", port: FEED_PORT }, 404);
}

// ============================================================================
// SERVER STARTUP
// ============================================================================

console.log(`
Signal Trade - Feed Server
==========================

Feed Endpoint:  http://localhost:${FEED_PORT}/feed/subscribe
Health Check:   http://localhost:${FEED_PORT}/feed/health

Authentication: Bearer token required
  Header: Authorization: Bearer st_live_xxx

Tiers:
  - free: 5 minute delay, 1 connection
  - paid: Real-time, 5 connections

Usage:
  curl -N http://localhost:${FEED_PORT}/feed/subscribe \\
    -H "Authorization: Bearer <your_api_key>"
`);

Bun.serve({
  port: FEED_PORT,
  fetch: handleRequest,
  idleTimeout: 255, // Max allowed by Bun
});

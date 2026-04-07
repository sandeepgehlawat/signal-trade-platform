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
import { randomBytes } from "crypto";

const FEED_PORT = parseInt(process.env.FEED_PORT || "3462");

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
// SSE ENDPOINT
// ============================================================================

function createSseResponse(req: Request, key: ValidatedKey): Response {
  const connectionId = `conn_${Date.now()}_${randomBytes(4).toString("hex")}`;

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
          "Access-Control-Allow-Origin": "*",
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
      console.log(`[feed] Connection closed: ${connectionId}`);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization",
    },
  });
}

// ============================================================================
// HTTP HANDLERS
// ============================================================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization",
    },
  });
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
  if (method === "POST" && path === "/feed/publish") {
    try {
      const body = await req.json() as TradePost;
      publishSignal(body);
      return jsonResponse({ success: true, subscribers: getSubscriberCount() });
    } catch (e) {
      return jsonResponse({ error: String(e) }, 400);
    }
  }

  return jsonResponse({ error: "Not found" }, 404);
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

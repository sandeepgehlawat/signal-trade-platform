#!/usr/bin/env bun
/**
 * Signal Trade - API Server
 *
 * HTTP + SSE endpoints for UI integration
 *
 * Endpoints:
 *   POST /process         - Process URL/text, returns run_id for streaming
 *   GET  /stream/:run_id  - SSE stream of processing events
 *   GET  /trades          - List all trades
 *   GET  /trades/:id      - Get single trade with live P&L
 *   POST /trades/:id/close - Close a trade
 *   GET  /stats           - Trade statistics
 */

import type {
  ExtractedSource,
  Thesis,
  RouteEvidence,
  TradePost,
  StreamEvent,
  EventType,
  Platform,
} from "../types";
import { extract } from "../scripts/extract";
import { route } from "../scripts/route";
import { extractTheses } from "../shared/thesis";
import { getHistoricalPriceByTicker } from "../shared/coingecko";
import {
  saveTrade,
  getTrade,
  getAllTrades,
  getTradeRow,
  updateTradePrice,
  updateTradeStatus,
  getTradeStats,
  getRecentSignals,
  saveSubscription,
  getActiveSubscription,
  cancelSubscription,
} from "../shared/storage";
import {
  createApiKey,
  listUserKeys,
  revokeApiKey,
  maskKey,
} from "../feed/keys";
import { resolve, normalize, join } from "path";
import { timingSafeEqual } from "crypto";
import {
  validateInput,
  processInputSchema,
  createKeySchema,
  createSubscriptionSchema,
  closeTradeSchema,
} from "../shared/validation";
import {
  startPaymentMonitors,
  createPaymentRequest,
  getPaymentDetails,
  getUserPaymentStatus,
  getAvailableChains,
  type SupportedChain,
} from "../payments/monitor";

// Publish signal to feed server via HTTP
const FEED_SERVER_URL = process.env.FEED_SERVER_URL || "http://localhost:3462";
const FEED_INTERNAL_SECRET = process.env.FEED_INTERNAL_SECRET || "dev_secret_change_in_prod";

async function publishSignalToFeed(trade: import("../types").TradePost): Promise<void> {
  try {
    const response = await fetch(`${FEED_SERVER_URL}/feed/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": FEED_INTERNAL_SECRET,
      },
      body: JSON.stringify(trade),
    });
    if (!response.ok) {
      console.error("[api] Failed to publish signal:", await response.text());
    }
  } catch (e) {
    console.error("[api] Failed to connect to feed server:", e);
  }
}
import { computeAuthorPnl, computePostedPnl } from "../shared/pnl";
import { execute as executeOrder, executeTradePost, getBalances } from "../shared/execute";

const PORT = parseInt(process.env.PORT || "3460");
const FRONTEND_PATH = new URL("../frontend", import.meta.url).pathname;

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

// Allowed origins - can be configured via CORS_ALLOWED_ORIGINS env var (comma-separated)
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3460",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3460",
];

const ALLOWED_ORIGINS = new Set(
  process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : DEFAULT_ALLOWED_ORIGINS
);

// In development mode, allow all origins
const CORS_DEV_MODE = process.env.NODE_ENV !== "production";

function getCorsOrigin(req: Request): string {
  const origin = req.headers.get("Origin");

  // In dev mode, reflect the origin back (allow all)
  if (CORS_DEV_MODE && origin) {
    return origin;
  }

  // In production, only allow configured origins
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return origin;
  }

  // Fallback for same-origin requests (no Origin header)
  return DEFAULT_ALLOWED_ORIGINS[0];
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

const API_TOKEN = process.env.SIGNAL_TRADE_API_TOKEN || process.env.API_TOKEN;
const AUTH_ENABLED = !!API_TOKEN;

// Constant-time string comparison to prevent timing attacks
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against self to maintain constant time even on length mismatch
    const bufA = Buffer.from(a);
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function checkAuth(req: Request): boolean {
  if (!AUTH_ENABLED) return true;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return false;

  return safeCompare(token, API_TOKEN!);
}

function authRequired(req: Request): Response | null {
  if (checkAuth(req)) return null;

  const origin = getCorsOrigin(req);
  return new Response(JSON.stringify({ error: "Unauthorized. Set Authorization: Bearer <token>" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": "Bearer",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

// ============================================================================
// IP EXTRACTION (with proxy validation)
// ============================================================================

// Only trust proxy headers if explicitly configured (e.g., when behind nginx/cloudflare)
const TRUST_PROXY = process.env.TRUST_PROXY === "true";

// Trusted proxy IPs (only used when TRUST_PROXY=true)
const TRUSTED_PROXIES = new Set(
  process.env.TRUSTED_PROXY_IPS
    ? process.env.TRUSTED_PROXY_IPS.split(",").map((ip) => ip.trim())
    : ["127.0.0.1", "::1"] // Default: localhost only
);

/**
 * Extract client IP address safely.
 * Only trusts X-Forwarded-For when TRUST_PROXY=true
 * This prevents IP spoofing attacks on rate limiting.
 */
function getClientIp(req: Request): string {
  if (TRUST_PROXY) {
    // When behind a trusted proxy, use the forwarded headers
    const xForwardedFor = req.headers.get("x-forwarded-for");
    if (xForwardedFor) {
      // Take the first IP (client IP) from the chain
      const clientIp = xForwardedFor.split(",")[0]?.trim();
      if (clientIp) return clientIp;
    }

    const xRealIp = req.headers.get("x-real-ip");
    if (xRealIp) return xRealIp;
  }

  // Default: return a generic identifier (Bun doesn't expose socket IP in fetch handler)
  // In production behind a proxy, TRUST_PROXY should be set
  return "direct-connection";
}

// ============================================================================
// RATE LIMITING
// ============================================================================

const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimiter.entries()) {
    if (now > entry.resetAt) {
      rateLimiter.delete(ip);
    }
  }
}, 60 * 1000);

// ============================================================================
// EVENT STREAMING
// ============================================================================

type EventCallback = (event: StreamEvent) => void;

interface StreamSubscription {
  callbacks: EventCallback[];
  createdAt: number;
  lastActivity: number;
}

const activeStreams = new Map<string, StreamSubscription>();
const STREAM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function emitEvent(runId: string, type: EventType, data?: Record<string, unknown>, thesisId?: string): void {
  const event: StreamEvent = {
    type,
    thesis_id: thesisId,
    data,
    timestamp: new Date().toISOString(),
  };

  const subscription = activeStreams.get(runId);
  if (subscription) {
    subscription.lastActivity = Date.now();
    for (const cb of subscription.callbacks) {
      try {
        cb(event);
      } catch (e) {
        console.error("[sse] Callback error:", e);
      }
    }
  }
}

function subscribeToStream(runId: string, callback: EventCallback): () => void {
  if (!activeStreams.has(runId)) {
    activeStreams.set(runId, {
      callbacks: [],
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });
  }

  const subscription = activeStreams.get(runId)!;
  subscription.callbacks.push(callback);
  subscription.lastActivity = Date.now();

  return () => {
    const sub = activeStreams.get(runId);
    if (sub) {
      const idx = sub.callbacks.indexOf(callback);
      if (idx >= 0) sub.callbacks.splice(idx, 1);
      if (sub.callbacks.length === 0) {
        activeStreams.delete(runId);
      }
    }
  };
}

// Clean up stale streams
setInterval(() => {
  const now = Date.now();
  for (const [runId, sub] of activeStreams.entries()) {
    if (now - sub.lastActivity > STREAM_TIMEOUT_MS) {
      console.log(`[sse] Cleaning up stale stream: ${runId}`);
      activeStreams.delete(runId);
    }
  }
}, 60 * 1000);

// ============================================================================
// HISTORICAL PRICE LOOKUP
// ============================================================================

async function getAuthorPrice(
  ticker: string,
  platform: Platform,
  sourceDate: string
): Promise<number | null> {
  if (platform === "hyperliquid") {
    // For Hyperliquid, use CoinGecko for crypto historical prices
    return getHistoricalPriceByTicker(ticker, sourceDate);
  }

  if (platform === "polymarket") {
    // Polymarket doesn't have historical prices - return null
    return null;
  }

  if (platform === "okx") {
    // OKX tokens - use CoinGecko
    const symbol = ticker.split(":")[0];
    return getHistoricalPriceByTicker(symbol, sourceDate);
  }

  return null;
}

// ============================================================================
// TRADE CREATION
// ============================================================================

function createTradePost(
  thesis: Thesis,
  routeEvidence: RouteEvidence,
  source: ExtractedSource,
  authorPrice: number | null
): TradePost {
  return {
    id: `trade_${Date.now()}`,
    thesis_id: thesis.id,
    ticker: routeEvidence.routed_ticker,
    direction: routeEvidence.direction,
    platform: routeEvidence.platform,
    instrument_type: routeEvidence.instrument_type,
    trade_type: routeEvidence.trade_type,
    headline_quote: routeEvidence.derivation.headline_quote,
    author_price: authorPrice || routeEvidence.author_price || 0,
    posted_price: routeEvidence.posted_price || 0,
    author: source.author || "Unknown",
    author_handle: source.author_handle,
    author_avatar: source.author_avatar,
    source_url: source.url,
    source_date: source.publish_date || new Date().toISOString(),
    derivation: routeEvidence.derivation,
    posted_at: new Date().toISOString(),
  };
}

// ============================================================================
// PROCESSING PIPELINE
// ============================================================================

async function processPipeline(
  input: string,
  runId: string,
  autoSave: boolean = true
): Promise<TradePost[]> {
  // Step 1: Extract
  emitEvent(runId, "extraction_started", { input });

  const extractResult = await extract(input);
  if (!extractResult.success || !extractResult.source) {
    emitEvent(runId, "error", { error: extractResult.error || "Extraction failed" });
    return [];
  }

  const source = extractResult.source;
  emitEvent(runId, "extraction_complete", {
    source_type: source.source_type,
    title: source.title,
    author: source.author,
    author_handle: source.author_handle,
    author_avatar: source.author_avatar,
    publish_date: source.publish_date,
    word_count: source.word_count,
    images: source.images,
  });

  // Step 2: Find theses using shared module
  const theses = extractTheses(source, runId);

  if (theses.length === 0) {
    emitEvent(runId, "source_complete", { trades_count: 0, reason: "No tradeable signals found" });
    return [];
  }

  for (const thesis of theses) {
    emitEvent(runId, "thesis_saved", {
      thesis_id: thesis.id,
      thesis_text: thesis.thesis_text,
      direction: thesis.direction,
      confidence: thesis.confidence,
      keywords: thesis.keywords,
      supporting_quotes: thesis.supporting_quotes,
    }, thesis.id);
  }

  // Step 3: Route each thesis
  const tradePosts: TradePost[] = [];

  for (const thesis of theses) {
    emitEvent(runId, "thesis_routing", {
      thesis_id: thesis.id,
    }, thesis.id);

    const routeEvidence = await route(thesis);

    if (!routeEvidence) {
      emitEvent(runId, "thesis_dropped", {
        thesis_id: thesis.id,
        reason: "No suitable instrument found",
      }, thesis.id);
      continue;
    }

    // Get historical author price
    const authorPrice = await getAuthorPrice(
      routeEvidence.routed_ticker,
      routeEvidence.platform,
      source.publish_date || new Date().toISOString()
    );

    emitEvent(runId, "thesis_routed", {
      thesis_id: thesis.id,
      ticker: routeEvidence.routed_ticker,
      platform: routeEvidence.platform,
      direction: routeEvidence.direction,
      trade_type: routeEvidence.trade_type,
      posted_price: routeEvidence.posted_price,
      author_price: authorPrice,
      derivation: routeEvidence.derivation,
      alternatives: routeEvidence.alternatives?.slice(0, 3),
    }, thesis.id);

    const post = createTradePost(thesis, routeEvidence, source, authorPrice);
    tradePosts.push(post);

    // Auto-save to database and publish to feed
    if (autoSave) {
      try {
        saveTrade(post);

        // Publish signal to feed subscribers
        publishSignalToFeed(post);

        emitEvent(runId, "trade_posted", {
          trade_id: post.id,
          ticker: post.ticker,
          platform: post.platform,
          direction: post.direction,
          posted_price: post.posted_price,
          author_price: post.author_price,
        }, thesis.id);
      } catch (e) {
        console.error("[api] Failed to save trade:", e);
      }
    }
  }

  emitEvent(runId, "source_complete", {
    trades_count: tradePosts.length,
    trade_ids: tradePosts.map((t) => t.id),
  });

  return tradePosts;
}

// ============================================================================
// PRICE FETCHING
// ============================================================================

async function fetchCurrentPrice(ticker: string, platform: Platform): Promise<number | null> {
  switch (platform) {
    case "hyperliquid":
      try {
        const response = await fetch("https://api.hyperliquid.xyz/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "allMids" }),
        });
        if (!response.ok) return null;
        const data: Record<string, string> = await response.json();
        return data[ticker] ? parseFloat(data[ticker]) : null;
      } catch {
        return null;
      }

    case "polymarket":
      try {
        const response = await fetch(
          `https://gamma-api.polymarket.com/markets?conditionId=${ticker}`
        );
        if (!response.ok) return null;
        const markets = await response.json();
        if (markets.length === 0) return null;
        const prices = JSON.parse(markets[0].outcomePrices);
        return prices[0];
      } catch {
        return null;
      }

    case "okx":
      try {
        // Use OKX adapter
        const { getCurrentPrice } = await import("../adapters/okx");
        return getCurrentPrice(ticker);
      } catch {
        return null;
      }

    default:
      return null;
  }
}

// ============================================================================
// HTTP HANDLERS
// ============================================================================

// Request context for CORS - set by handleRequest
let currentRequest: Request | null = null;

function jsonResponse(data: unknown, status = 200): Response {
  const origin = currentRequest ? getCorsOrigin(currentRequest) : DEFAULT_ALLOWED_ORIGINS[0];
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

function sseResponse(runId: string): Response {
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: StreamEvent) => {
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch (e) {
          console.error("[sse] Failed to send event:", e);
        }
      };

      // Send initial connection event
      sendEvent({
        type: "extraction_started",
        data: { message: "Connected to stream" },
        timestamp: new Date().toISOString(),
      });

      unsubscribe = subscribeToStream(runId, sendEvent);
    },
    cancel() {
      // Clean up when client disconnects
      if (unsubscribe) {
        unsubscribe();
      }
    },
  });

  const origin = currentRequest ? getCorsOrigin(currentRequest) : DEFAULT_ALLOWED_ORIGINS[0];
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

async function handleProcess(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    // Support multiple input field names for backwards compatibility
    const rawInput = body.input || body.url || body.text;
    const normalizedBody = { input: rawInput, auto_save: body.auto_save };

    // Validate input with Zod
    const validation = validateInput(processInputSchema, normalizedBody);
    if (!validation.success) {
      return jsonResponse({ error: validation.error }, 400);
    }

    const { input, auto_save: autoSave } = validation.data;
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Start processing in background
    processPipeline(input, runId, autoSave).catch((e) => {
      console.error("[api] Pipeline error:", e);
      emitEvent(runId, "error", { error: String(e) });
    });

    return jsonResponse({
      run_id: runId,
      stream_url: `/stream/${runId}`,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
}

async function handleGetTrades(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") as "open" | "closed" | "expired" | undefined;

  const trades = getAllTrades(status || undefined);

  // Enrich with current prices for open trades
  const enriched = await Promise.all(
    trades.map(async (trade) => {
      if (trade.status === "open") {
        const price = await fetchCurrentPrice(trade.ticker, trade.platform);
        const row = getTradeRow(trade.trade_id);

        if (price && row) {
          const authorPnl = computeAuthorPnl(row.author_price, price, trade.direction, trade.platform);
          const postedPnl = computePostedPnl(row.posted_price, price, trade.direction, trade.platform);

          return {
            ...trade,
            current_price: price,
            author_pnl: authorPnl,
            posted_pnl: postedPnl,
            author_price: row.author_price,
            posted_price: row.posted_price,
            headline_quote: row.headline_quote,
          };
        }
      }

      const row = getTradeRow(trade.trade_id);
      return {
        ...trade,
        author_price: row?.author_price,
        posted_price: row?.posted_price,
        headline_quote: row?.headline_quote,
      };
    })
  );

  return jsonResponse({ trades: enriched });
}

async function handleGetTrade(tradeId: string): Promise<Response> {
  const trade = getTrade(tradeId);
  const row = getTradeRow(tradeId);

  if (!trade || !row) {
    return jsonResponse({ error: "Trade not found" }, 404);
  }

  // Fetch live price
  let currentPrice = trade.current_price;
  let authorPnl = trade.author_pnl;
  let postedPnl = trade.posted_pnl;

  if (trade.status === "open") {
    const price = await fetchCurrentPrice(trade.ticker, trade.platform);
    if (price) {
      currentPrice = price;
      authorPnl = computeAuthorPnl(row.author_price, price, trade.direction, trade.platform);
      postedPnl = computePostedPnl(row.posted_price, price, trade.direction, trade.platform);

      // Update database
      updateTradePrice(tradeId, price, authorPnl, postedPnl);
    }
  }

  return jsonResponse({
    trade: {
      ...trade,
      current_price: currentPrice,
      author_pnl: authorPnl,
      posted_pnl: postedPnl,
      author_price: row.author_price,
      posted_price: row.posted_price,
      headline_quote: row.headline_quote,
      source_url: row.source_url,
      source_date: row.source_date,
      author: row.author,
      author_handle: row.author_handle,
    },
  });
}

async function handleCloseTrade(tradeId: string, req: Request): Promise<Response> {
  // Require auth for closing trades
  const authError = authRequired(req);
  if (authError) return authError;

  const trade = getTrade(tradeId);
  if (!trade) {
    return jsonResponse({ error: "Trade not found" }, 404);
  }

  if (trade.status !== "open") {
    return jsonResponse({ error: "Trade is not open" }, 400);
  }

  // Fetch final price
  const price = await fetchCurrentPrice(trade.ticker, trade.platform);
  const row = getTradeRow(tradeId);

  if (price && row) {
    const authorPnl = computeAuthorPnl(row.author_price, price, trade.direction, trade.platform);
    const postedPnl = computePostedPnl(row.posted_price, price, trade.direction, trade.platform);
    updateTradePrice(tradeId, price, authorPnl, postedPnl);
  }

  updateTradeStatus(tradeId, "closed");

  return jsonResponse({ success: true, trade_id: tradeId });
}

function handleGetStats(): Response {
  const stats = getTradeStats();
  return jsonResponse({ stats });
}

// ============================================================================
// EXECUTION ENDPOINTS
// ============================================================================

async function handleExecuteTrade(tradeId: string, req: Request): Promise<Response> {
  // Require auth for executing trades
  const authError = authRequired(req);
  if (authError) return authError;

  const trade = getTrade(tradeId);
  const row = getTradeRow(tradeId);

  if (!trade || !row) {
    return jsonResponse({ error: "Trade not found" }, 404);
  }

  if (trade.status !== "open") {
    return jsonResponse({ error: "Trade is not open" }, 400);
  }

  // Execute the trade
  const result = await executeTradePost({
    id: trade.trade_id,
    thesis_id: trade.thesis_id,
    ticker: trade.ticker,
    direction: trade.direction,
    platform: trade.platform,
    instrument_type: "perp",
    trade_type: "direct",
    headline_quote: row.headline_quote || "",
    author_price: row.author_price || 0,
    posted_price: row.posted_price || 0,
    author: row.author || "",
    source_url: row.source_url || "",
    source_date: row.source_date || "",
    derivation: { headline_quote: row.headline_quote || "", explanation: "", steps: [] },
    posted_at: trade.opened_at,
  });

  return jsonResponse({
    success: result.success,
    trade_id: tradeId,
    execution: {
      platform: result.platform,
      orderId: result.orderId,
      filledSize: result.filledSize,
      avgPrice: result.avgPrice,
      txHash: result.txHash,
      error: result.error,
    },
  });
}

async function handleDirectExecute(req: Request): Promise<Response> {
  // Require auth for direct execution
  const authError = authRequired(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { platform, ticker, direction, size, price, leverage, conditionId } = body;

    if (!platform || !ticker || !direction) {
      return jsonResponse({
        error: "Missing required fields: platform, ticker, direction",
      }, 400);
    }

    const result = await executeOrder({
      platform,
      ticker,
      direction,
      size: size || parseFloat(process.env.RISK_CAPITAL || "10000") * 0.05,
      price,
      leverage,
      conditionId,
    });

    return jsonResponse({
      success: result.success,
      execution: result,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
}

async function handleGetBalances(req: Request): Promise<Response> {
  // Require auth for balance check
  const authError = authRequired(req);
  if (authError) return authError;

  const balances = await getBalances();
  return jsonResponse({ balances });
}

// ============================================================================
// API KEY ENDPOINTS
// ============================================================================

async function handleCreateApiKey(req: Request): Promise<Response> {
  // Require auth for key creation
  const authError = authRequired(req);
  if (authError) return authError;

  try {
    const body = await req.json();

    // Generate default user_id if not provided
    const rawBody = {
      user_id: body.user_id || `user_${Date.now()}`,
      tier: body.tier,
    };

    // Validate input
    const validation = validateInput(createKeySchema, rawBody);
    if (!validation.success) {
      return jsonResponse({ error: validation.error }, 400);
    }

    const { user_id: userId, tier } = validation.data;
    const result = createApiKey(userId, tier);

    return jsonResponse({
      success: true,
      key: {
        id: result.id,
        key: result.key, // Only shown once!
        key_masked: maskKey(result.key),
        tier: result.tier,
        user_id: userId,
        created_at: new Date().toISOString(),
      },
      warning: "Save this key now - it won't be shown again!",
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
}

async function handleListApiKeys(userId: string, req: Request): Promise<Response> {
  // Require auth
  const authError = authRequired(req);
  if (authError) return authError;

  const keys = listUserKeys(userId);

  return jsonResponse({
    keys: keys.map((k) => ({
      id: k.id,
      tier: k.tier,
      created_at: k.created_at,
      last_used_at: k.last_used_at,
      is_active: k.is_active,
    })),
  });
}

async function handleRevokeApiKey(keyId: string, req: Request): Promise<Response> {
  // Require auth
  const authError = authRequired(req);
  if (authError) return authError;

  revokeApiKey(keyId);

  return jsonResponse({ success: true, key_id: keyId });
}

// ============================================================================
// SUBSCRIPTION ENDPOINTS
// ============================================================================

async function handleCreateSubscription(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    // Validate input with Zod
    const validation = validateInput(createSubscriptionSchema, body);
    if (!validation.success) {
      return jsonResponse({ error: validation.error }, 400);
    }

    const { user_id: userId, tier, billing_period: billingPeriod } = validation.data;
    const amountCents = tier === "paid" ? 500 : 0; // $5/week for paid

    // Calculate expiry
    const expiresAt = new Date();
    if (billingPeriod === "weekly") {
      expiresAt.setDate(expiresAt.getDate() + 7);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    const subscriptionId = `sub_${Date.now()}`;

    saveSubscription(
      subscriptionId,
      userId,
      tier,
      amountCents,
      billingPeriod,
      expiresAt.toISOString()
    );

    return jsonResponse({
      success: true,
      subscription: {
        id: subscriptionId,
        user_id: userId,
        tier,
        status: "active",
        amount_cents: amountCents,
        billing_period: billingPeriod,
        expires_at: expiresAt.toISOString(),
      },
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
}

async function handleGetSubscription(userId: string): Promise<Response> {
  const subscription = getActiveSubscription(userId);

  if (!subscription) {
    return jsonResponse({
      subscription: null,
      tier: "free",
    });
  }

  return jsonResponse({
    subscription: {
      id: subscription.id,
      tier: subscription.tier,
      status: subscription.status,
      amount_cents: subscription.amount_cents,
      billing_period: subscription.billing_period,
      started_at: subscription.started_at,
      expires_at: subscription.expires_at,
    },
  });
}

async function handleCancelSubscription(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const subscriptionId = body.subscription_id;

    if (!subscriptionId) {
      return jsonResponse({ error: "subscription_id required" }, 400);
    }

    cancelSubscription(subscriptionId);

    return jsonResponse({ success: true, subscription_id: subscriptionId });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
}

// ============================================================================
// SIGNALS ENDPOINT
// ============================================================================

async function handleGetSignals(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const signals = getRecentSignals(Math.min(limit, 100));

  return jsonResponse({
    signals: signals.map((s) => ({
      id: s.id,
      ticker: s.ticker,
      direction: s.direction,
      platform: s.platform,
      confidence: s.confidence,
      entry_price: s.entry_price,
      headline_quote: s.headline_quote,
      execution_priority: s.execution_priority ? JSON.parse(s.execution_priority) : null,
      published_at: s.published_at,
      delayed_until: s.delayed_until,
    })),
  });
}

// ============================================================================
// ROUTER
// ============================================================================

async function handleRequest(req: Request): Promise<Response> {
  // Set current request for CORS handling
  currentRequest = req;

  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Get client IP for rate limiting (with proxy validation)
  const ip = getClientIp(req);

  // CORS preflight
  if (method === "OPTIONS") {
    const origin = getCorsOrigin(req);
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400", // Cache preflight for 24 hours
      },
    });
  }

  // Rate limiting for POST endpoints
  if (method === "POST" && !checkRateLimit(ip)) {
    return jsonResponse({ error: "Rate limit exceeded. Try again later." }, 429);
  }

  // Routes
  if (method === "POST" && path === "/process") {
    return handleProcess(req);
  }

  if (method === "GET" && path.startsWith("/stream/")) {
    const runId = path.slice(8);
    return sseResponse(runId);
  }

  if (method === "GET" && path === "/trades") {
    return handleGetTrades(req);
  }

  if (method === "GET" && path.startsWith("/trades/")) {
    const tradeId = path.slice(8);
    return handleGetTrade(tradeId);
  }

  if (method === "POST" && path.match(/^\/trades\/[^/]+\/close$/)) {
    const tradeId = path.split("/")[2];
    return handleCloseTrade(tradeId, req);
  }

  if (method === "POST" && path.match(/^\/trades\/[^/]+\/execute$/)) {
    const tradeId = path.split("/")[2];
    return handleExecuteTrade(tradeId, req);
  }

  if (method === "POST" && path === "/execute") {
    return handleDirectExecute(req);
  }

  if (method === "GET" && path === "/balances") {
    return handleGetBalances(req);
  }

  if (method === "GET" && path === "/stats") {
    return handleGetStats();
  }

  if (method === "GET" && path === "/health") {
    return jsonResponse({
      status: "ok",
      timestamp: new Date().toISOString(),
      active_streams: activeStreams.size,
    });
  }

  // API Key routes
  if (method === "POST" && path === "/keys") {
    return handleCreateApiKey(req);
  }

  if (method === "GET" && path.startsWith("/keys/")) {
    const userId = path.slice(6);
    return handleListApiKeys(userId, req);
  }

  if (method === "DELETE" && path.startsWith("/keys/")) {
    const keyId = path.slice(6);
    return handleRevokeApiKey(keyId, req);
  }

  // Subscription routes
  if (method === "POST" && path === "/subscribe") {
    return handleCreateSubscription(req);
  }

  if (method === "GET" && path.startsWith("/subscribe/")) {
    const userId = path.slice(11);
    return handleGetSubscription(userId);
  }

  if (method === "POST" && path === "/subscribe/cancel") {
    return handleCancelSubscription(req);
  }

  // Signals route
  if (method === "GET" && path === "/signals") {
    return handleGetSignals(req);
  }

  // ========== PAYMENT ROUTES ==========

  // Get available payment chains
  if (method === "GET" && path === "/payments/chains") {
    return jsonResponse({ chains: getAvailableChains() });
  }

  // Create payment request
  if (method === "POST" && path === "/payments/create") {
    try {
      const body = await req.json();
      const { user_id, chain, period } = body;

      if (!user_id) {
        return jsonResponse({ error: "user_id is required" }, 400);
      }

      if (!chain || !["polygon", "xlayer", "solana"].includes(chain)) {
        return jsonResponse({ error: "Invalid chain. Use: polygon, xlayer, or solana" }, 400);
      }

      const payment = createPaymentRequest(user_id, chain as SupportedChain, period || "weekly");

      return jsonResponse({
        success: true,
        payment: {
          id: payment.id,
          chain: payment.chain,
          amount: payment.amount,
          amountUsdc: payment.amountUsdc,
          depositAddress: payment.depositAddress,
          memo: payment.memo,
          expiresAt: payment.expiresAt,
        },
        instructions: [
          `Send exactly $${payment.amountUsdc.toFixed(2)} USDC`,
          `To: ${payment.depositAddress}`,
          `Network: ${payment.chain === "xlayer" ? "X Layer" : payment.chain === "polygon" ? "Polygon" : "Solana"}`,
          `Reference: ${payment.memo}`,
          "",
          "Payment will be detected automatically within 1-2 minutes.",
        ],
      });
    } catch (e) {
      return jsonResponse({ error: String(e) }, 500);
    }
  }

  // Get payment status
  if (method === "GET" && path.startsWith("/payments/status/")) {
    const paymentId = path.slice(17);
    const payment = getPaymentDetails(paymentId);

    if (!payment) {
      return jsonResponse({ error: "Payment not found" }, 404);
    }

    return jsonResponse({ payment });
  }

  // Get user's payment history and subscription
  if (method === "GET" && path.startsWith("/payments/user/")) {
    const userId = path.slice(15);
    const status = getUserPaymentStatus(userId);
    return jsonResponse(status);
  }

  // Serve frontend
  if (method === "GET" && (path === "/" || path === "/index.html")) {
    const file = Bun.file(`${FRONTEND_PATH}/index.html`);
    return new Response(file, {
      headers: { "Content-Type": "text/html" },
    });
  }

  // Serve static files from frontend/
  // Protected against path traversal attacks
  if (method === "GET" && path.startsWith("/static/")) {
    const requestedPath = path.slice(7); // Remove "/static"
    const normalizedPath = normalize(requestedPath).replace(/^(\.\.[\/\\])+/, "");
    const filePath = resolve(FRONTEND_PATH, normalizedPath);

    // Ensure the resolved path is within FRONTEND_PATH
    if (!filePath.startsWith(resolve(FRONTEND_PATH))) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }
  }

  return jsonResponse({ error: "Not found" }, 404);
}

// ============================================================================
// SERVER
// ============================================================================

const PAPER_MODE = process.env.PAPER_MODE !== "false";

console.log(`
Signal Trade
============

Dashboard:  http://localhost:${PORT}
Feed:       http://localhost:3462/feed/subscribe (separate process)
Auth:       ${AUTH_ENABLED ? "ENABLED" : "DISABLED (set SIGNAL_TRADE_API_TOKEN to enable)"}
Mode:       ${PAPER_MODE ? "PAPER (no real trades)" : "LIVE TRADING"}

API Endpoints:
  POST /process            - Process URL/text, returns run_id
  GET  /stream/:run_id     - SSE stream of events
  GET  /trades             - List trades (?status=open|closed|expired)
  GET  /trades/:id         - Get trade with live P&L
  POST /trades/:id/close   - Close a trade ${AUTH_ENABLED ? "(auth required)" : ""}
  POST /trades/:id/execute - Execute trade on exchange ${AUTH_ENABLED ? "(auth required)" : ""}
  POST /execute            - Direct execution ${AUTH_ENABLED ? "(auth required)" : ""}
  GET  /balances           - Platform balances ${AUTH_ENABLED ? "(auth required)" : ""}
  GET  /stats              - Trade statistics
  GET  /health             - Health check

Feed System:
  POST /keys               - Generate API key ${AUTH_ENABLED ? "(auth required)" : ""}
  GET  /keys/:user_id      - List user's keys ${AUTH_ENABLED ? "(auth required)" : ""}
  DELETE /keys/:key_id     - Revoke key ${AUTH_ENABLED ? "(auth required)" : ""}
  POST /subscribe          - Create/upgrade subscription
  GET  /subscribe/:user_id - Get subscription status
  POST /subscribe/cancel   - Cancel subscription
  GET  /signals            - List recent signals

Payments (USDC):
  GET  /payments/chains       - List available payment chains
  POST /payments/create       - Create payment request
  GET  /payments/status/:id   - Check payment status
  GET  /payments/user/:id     - User's payment history

${PAPER_MODE ? "Set PAPER_MODE=false in .env for live trading" : "WARNING: Live trading enabled!"}
`);

Bun.serve({
  port: PORT,
  fetch: handleRequest,
  idleTimeout: 120, // 2 minutes
});

// Start payment monitors (USDC on Polygon, X Layer, Solana)
startPaymentMonitors();

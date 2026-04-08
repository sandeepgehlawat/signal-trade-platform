/**
 * Signal Trade - News Publisher
 *
 * Broadcasts news items to all connected feed subscribers
 * Handles tier-based delay (5 min for free tier)
 */

import type { FeedSignal, FeedEvent, FeedNewsItem, TradePost, Platform, ApiKeyTier } from "../types";
import { saveSignal, saveNews } from "../shared/storage";
import { RATE_LIMITS } from "./keys";

// ============================================================================
// SUBSCRIBER MANAGEMENT
// ============================================================================

export interface Subscriber {
  id: string;
  userId: string;
  tier: ApiKeyTier;
  callback: (event: FeedEvent) => void;
  connectedAt: number;
}

const subscribers = new Map<string, Subscriber>();

// Queue for delayed signals (free tier)
interface DelayedSignal {
  signal: FeedSignal;
  publishAt: number;
}
const delayedQueue: DelayedSignal[] = [];

// ============================================================================
// SUBSCRIPTION
// ============================================================================

/**
 * Add a subscriber to receive feed events
 */
export function addSubscriber(subscriber: Subscriber): void {
  subscribers.set(subscriber.id, subscriber);
  console.log(`[feed] Subscriber added: ${subscriber.id} (tier: ${subscriber.tier})`);
}

/**
 * Remove a subscriber
 */
export function removeSubscriber(subscriberId: string): void {
  subscribers.delete(subscriberId);
  console.log(`[feed] Subscriber removed: ${subscriberId}`);
}

/**
 * Get count of active subscribers
 */
export function getSubscriberCount(): number {
  return subscribers.size;
}

/**
 * Get subscribers by tier
 */
export function getSubscribersByTier(): { free: number; paid: number } {
  let free = 0;
  let paid = 0;
  for (const sub of subscribers.values()) {
    if (sub.tier === "paid") paid++;
    else free++;
  }
  return { free, paid };
}

// ============================================================================
// SIGNAL BROADCASTING
// ============================================================================

/**
 * Create a FeedSignal from a TradePost
 */
export function createSignalFromTrade(trade: TradePost): FeedSignal {
  const now = new Date().toISOString();

  return {
    id: `sig_${Date.now()}`,
    trade_id: trade.id,
    ticker: trade.ticker,
    direction: trade.direction,
    platform: trade.platform,
    confidence: 0.7, // Default confidence
    entry_price: trade.posted_price,
    headline_quote: trade.headline_quote,
    execution_priority: ["okx", "hyperliquid", "polymarket"] as Platform[],
    published_at: now,
  };
}

/**
 * Publish a signal to all subscribers
 * - Paid subscribers get it immediately
 * - Free subscribers get it after 5 min delay
 */
export function publishSignal(trade: TradePost): void {
  const signal = createSignalFromTrade(trade);
  const now = Date.now();

  // Save to database for history
  saveSignal({
    id: signal.id,
    trade_id: signal.trade_id,
    ticker: signal.ticker,
    direction: signal.direction,
    platform: signal.platform,
    confidence: signal.confidence,
    entry_price: signal.entry_price,
    headline_quote: signal.headline_quote,
    execution_priority: signal.execution_priority,
    published_at: signal.published_at,
    delayed_until: new Date(now + RATE_LIMITS.free.delayMs).toISOString(),
  });

  // Broadcast to paid subscribers immediately
  broadcastToTier("paid", signal);

  // Queue for free subscribers (5 min delay)
  const delayMs = RATE_LIMITS.free.delayMs;
  if (delayMs > 0) {
    const delayedSignal: DelayedSignal = {
      signal: {
        ...signal,
        delayed_until: new Date(now + delayMs).toISOString(),
      },
      publishAt: now + delayMs,
    };
    delayedQueue.push(delayedSignal);
    console.log(`[feed] Signal ${signal.id} queued for free tier (delay: ${delayMs / 1000}s)`);
  } else {
    // No delay for free tier (shouldn't happen with current config)
    broadcastToTier("free", signal);
  }

  console.log(`[feed] Published signal: ${signal.ticker} ${signal.direction} on ${signal.platform}`);
}

/**
 * Broadcast a signal to subscribers of a specific tier
 */
function broadcastToTier(tier: ApiKeyTier, signal: FeedSignal): void {
  const event: FeedEvent = {
    type: "signal",
    data: signal,
    timestamp: new Date().toISOString(),
  };

  for (const subscriber of subscribers.values()) {
    if (subscriber.tier === tier) {
      try {
        subscriber.callback(event);
      } catch (e) {
        console.error(`[feed] Error sending to subscriber ${subscriber.id}:`, e);
      }
    }
  }
}

/**
 * Broadcast to all subscribers (used for heartbeats)
 */
export function broadcastToAll(event: FeedEvent): void {
  for (const subscriber of subscribers.values()) {
    try {
      subscriber.callback(event);
    } catch (e) {
      console.error(`[feed] Error sending to subscriber ${subscriber.id}:`, e);
    }
  }
}

// ============================================================================
// DELAYED SIGNAL PROCESSOR
// ============================================================================

/**
 * Process delayed signals queue
 * Should be called periodically (every second)
 */
export function processDelayedQueue(): void {
  const now = Date.now();
  const ready: DelayedSignal[] = [];
  const remaining: DelayedSignal[] = [];

  for (const item of delayedQueue) {
    if (item.publishAt <= now) {
      ready.push(item);
    } else {
      remaining.push(item);
    }
  }

  // Clear and refill queue with remaining items
  delayedQueue.length = 0;
  delayedQueue.push(...remaining);

  // Broadcast ready signals to free tier
  for (const item of ready) {
    console.log(`[feed] Releasing delayed signal ${item.signal.id} to free tier`);
    broadcastToTier("free", item.signal);
  }
}

// Start delayed queue processor
setInterval(processDelayedQueue, 1000);

// ============================================================================
// HEARTBEAT
// ============================================================================

const HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds

/**
 * Send heartbeat to all subscribers to keep connections alive
 */
function sendHeartbeat(): void {
  const event: FeedEvent = {
    type: "heartbeat",
    data: {
      subscribers: subscribers.size,
      timestamp: Date.now(),
    },
    timestamp: new Date().toISOString(),
  };
  broadcastToAll(event);
}

// Start heartbeat timer
setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

// ============================================================================
// NEWS BROADCASTING
// ============================================================================

// Queue for delayed news (free tier)
interface DelayedNews {
  news: FeedNewsItem;
  publishAt: number;
}
const delayedNewsQueue: DelayedNews[] = [];

/**
 * Publish a news item to all subscribers
 * - Paid subscribers get it immediately
 * - Free subscribers get it after 5 min delay
 */
export function publishNews(news: FeedNewsItem): void {
  const now = Date.now();

  // Save to database for history
  saveNews({
    id: news.id,
    headline: news.headline,
    summary: news.summary,
    source: news.source,
    source_type: news.source_type,
    author: news.author,
    author_handle: news.author_handle,
    author_avatar: news.author_avatar,
    url: news.url,
    sentiment: news.sentiment,
    assets: news.assets,
    published_at: news.published_at,
  });

  // Broadcast to paid subscribers immediately
  broadcastNewsToTier("paid", news);

  // Queue for free subscribers (5 min delay)
  const delayMs = RATE_LIMITS.free.delayMs;
  if (delayMs > 0) {
    const delayedNews: DelayedNews = {
      news,
      publishAt: now + delayMs,
    };
    delayedNewsQueue.push(delayedNews);
    console.log(`[feed] News ${news.id} queued for free tier (delay: ${delayMs / 1000}s)`);
  } else {
    broadcastNewsToTier("free", news);
  }

  console.log(`[feed] Published news: ${news.headline.slice(0, 50)}...`);
}

/**
 * Broadcast a news item to subscribers of a specific tier
 */
function broadcastNewsToTier(tier: ApiKeyTier, news: FeedNewsItem): void {
  const event: FeedEvent = {
    type: "news",
    data: news,
    timestamp: new Date().toISOString(),
  };

  for (const subscriber of subscribers.values()) {
    if (subscriber.tier === tier) {
      try {
        subscriber.callback(event);
      } catch (e) {
        console.error(`[feed] Error sending news to subscriber ${subscriber.id}:`, e);
      }
    }
  }
}

/**
 * Process delayed news queue
 */
export function processDelayedNewsQueue(): void {
  const now = Date.now();
  const ready: DelayedNews[] = [];
  const remaining: DelayedNews[] = [];

  for (const item of delayedNewsQueue) {
    if (item.publishAt <= now) {
      ready.push(item);
    } else {
      remaining.push(item);
    }
  }

  // Clear and refill queue with remaining items
  delayedNewsQueue.length = 0;
  delayedNewsQueue.push(...remaining);

  // Broadcast ready news to free tier
  for (const item of ready) {
    console.log(`[feed] Releasing delayed news ${item.news.id} to free tier`);
    broadcastNewsToTier("free", item.news);
  }
}

// Start delayed news queue processor
setInterval(processDelayedNewsQueue, 1000);

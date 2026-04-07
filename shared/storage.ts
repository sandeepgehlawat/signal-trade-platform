/**
 * Signal Trade - Storage Layer
 *
 * SQLite persistence for trade tracking
 * Uses bun:sqlite for native SQLite support
 */

import { Database } from "bun:sqlite";
import type { TradePost, TrackedTrade, Direction, Platform } from "../types";
import { toPositivePrice } from "./pricing";

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

const DB_PATH = new URL("../signal-trade.db", import.meta.url).pathname;
const db = new Database(DB_PATH);

// Create trades table
db.run(`
  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    thesis_id TEXT,
    ticker TEXT NOT NULL,
    direction TEXT NOT NULL,
    platform TEXT NOT NULL,
    instrument_type TEXT,
    trade_type TEXT,
    headline_quote TEXT,
    author_price REAL,
    posted_price REAL,
    current_price REAL,
    author_pnl REAL,
    posted_pnl REAL,
    author TEXT,
    author_handle TEXT,
    source_url TEXT,
    source_date TEXT,
    status TEXT DEFAULT 'open',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Create index for common queries
db.run(`CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker)`);

// ============================================================================
// API KEYS TABLE
// ============================================================================

db.run(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    tier TEXT DEFAULT 'free',
    created_at TEXT NOT NULL,
    expires_at TEXT,
    last_used_at TEXT,
    is_active INTEGER DEFAULT 1
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)`);

// ============================================================================
// SUBSCRIPTIONS TABLE
// ============================================================================

db.run(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tier TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    amount_cents INTEGER DEFAULT 500,
    billing_period TEXT DEFAULT 'weekly',
    started_at TEXT NOT NULL,
    expires_at TEXT
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)`);

// ============================================================================
// SIGNALS TABLE (for history/replay)
// ============================================================================

db.run(`
  CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    trade_id TEXT,
    ticker TEXT NOT NULL,
    direction TEXT NOT NULL,
    platform TEXT NOT NULL,
    confidence REAL,
    entry_price REAL,
    headline_quote TEXT,
    execution_priority TEXT,
    published_at TEXT NOT NULL,
    delayed_until TEXT
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_signals_published_at ON signals(published_at)`);

// ============================================================================
// PREPARED STATEMENTS
// ============================================================================

const insertTrade = db.prepare(`
  INSERT INTO trades (
    id, thesis_id, ticker, direction, platform, instrument_type, trade_type,
    headline_quote, author_price, posted_price, current_price,
    author_pnl, posted_pnl, author, author_handle, source_url, source_date,
    status, created_at, updated_at
  ) VALUES (
    $id, $thesis_id, $ticker, $direction, $platform, $instrument_type, $trade_type,
    $headline_quote, $author_price, $posted_price, $current_price,
    $author_pnl, $posted_pnl, $author, $author_handle, $source_url, $source_date,
    $status, $created_at, $updated_at
  )
`);

const selectTradeById = db.prepare(`SELECT * FROM trades WHERE id = ?`);
const selectAllTrades = db.prepare(`SELECT * FROM trades ORDER BY created_at DESC`);
const selectTradesByStatus = db.prepare(`SELECT * FROM trades WHERE status = ? ORDER BY created_at DESC`);

const updateTradePriceStmt = db.prepare(`
  UPDATE trades
  SET current_price = $current_price,
      author_pnl = $author_pnl,
      posted_pnl = $posted_pnl,
      updated_at = $updated_at
  WHERE id = $id
`);

const updateTradeStatusStmt = db.prepare(`
  UPDATE trades SET status = $status, updated_at = $updated_at WHERE id = $id
`);

// API Keys statements
const insertApiKey = db.prepare(`
  INSERT INTO api_keys (id, key_hash, user_id, tier, created_at, expires_at, is_active)
  VALUES ($id, $key_hash, $user_id, $tier, $created_at, $expires_at, $is_active)
`);

const selectApiKeyByHash = db.prepare(`SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1`);
const selectApiKeysByUser = db.prepare(`SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`);
const updateApiKeyLastUsed = db.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`);
const deactivateApiKey = db.prepare(`UPDATE api_keys SET is_active = 0 WHERE id = ?`);

// Subscriptions statements
const insertSubscription = db.prepare(`
  INSERT INTO subscriptions (id, user_id, tier, status, amount_cents, billing_period, started_at, expires_at)
  VALUES ($id, $user_id, $tier, $status, $amount_cents, $billing_period, $started_at, $expires_at)
`);

const selectSubscriptionByUser = db.prepare(`
  SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1
`);

const updateSubscriptionStatus = db.prepare(`UPDATE subscriptions SET status = ? WHERE id = ?`);

// Signals statements
const insertSignal = db.prepare(`
  INSERT INTO signals (id, trade_id, ticker, direction, platform, confidence, entry_price, headline_quote, execution_priority, published_at, delayed_until)
  VALUES ($id, $trade_id, $ticker, $direction, $platform, $confidence, $entry_price, $headline_quote, $execution_priority, $published_at, $delayed_until)
`);

const selectRecentSignals = db.prepare(`
  SELECT * FROM signals ORDER BY published_at DESC LIMIT ?
`);

// ============================================================================
// TYPE CONVERSIONS
// ============================================================================

interface TradeRow {
  id: string;
  thesis_id: string | null;
  ticker: string;
  direction: string;
  platform: string;
  instrument_type: string | null;
  trade_type: string | null;
  headline_quote: string | null;
  author_price: number | null;
  posted_price: number | null;
  current_price: number | null;
  author_pnl: number | null;
  posted_pnl: number | null;
  author: string | null;
  author_handle: string | null;
  source_url: string | null;
  source_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToTrackedTrade(row: TradeRow): TrackedTrade {
  return {
    trade_id: row.id,
    thesis_id: row.thesis_id || "",
    ticker: row.ticker,
    direction: row.direction as Direction,
    platform: row.platform as Platform,
    entry_price: row.posted_price || row.author_price || 0,
    current_price: row.current_price || undefined,
    author_pnl: row.author_pnl || undefined,
    posted_pnl: row.posted_pnl || undefined,
    status: row.status as "open" | "closed" | "expired",
    opened_at: row.created_at,
    closed_at: row.status === "closed" ? row.updated_at : undefined,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Save a new trade post to the database
 * @returns The trade ID
 */
export function saveTrade(trade: TradePost): string {
  const now = new Date().toISOString();

  insertTrade.run({
    $id: trade.id,
    $thesis_id: trade.thesis_id,
    $ticker: trade.ticker,
    $direction: trade.direction,
    $platform: trade.platform,
    $instrument_type: trade.instrument_type,
    $trade_type: trade.trade_type,
    $headline_quote: trade.headline_quote,
    $author_price: toPositivePrice(trade.author_price),
    $posted_price: toPositivePrice(trade.posted_price),
    $current_price: toPositivePrice(trade.posted_price), // Initially same as posted
    $author_pnl: null,
    $posted_pnl: null,
    $author: trade.author,
    $author_handle: trade.author_handle || null,
    $source_url: trade.source_url,
    $source_date: trade.source_date,
    $status: "open",
    $created_at: trade.posted_at || now,
    $updated_at: now,
  });

  return trade.id;
}

/**
 * Get a single trade by ID
 */
export function getTrade(id: string): TrackedTrade | null {
  const row = selectTradeById.get(id) as TradeRow | null;
  if (!row) return null;
  return rowToTrackedTrade(row);
}

/**
 * Get all trades, optionally filtered by status
 */
export function getAllTrades(status?: "open" | "closed" | "expired"): TrackedTrade[] {
  const rows = status
    ? (selectTradesByStatus.all(status) as TradeRow[])
    : (selectAllTrades.all() as TradeRow[]);

  return rows.map(rowToTrackedTrade);
}

/**
 * Update a trade's current price and P&L
 */
export function updateTradePrice(
  id: string,
  currentPrice: number,
  authorPnl?: number | null,
  postedPnl?: number | null
): void {
  updateTradePriceStmt.run({
    $id: id,
    $current_price: toPositivePrice(currentPrice),
    $author_pnl: authorPnl ?? null,
    $posted_pnl: postedPnl ?? null,
    $updated_at: new Date().toISOString(),
  });
}

/**
 * Update a trade's status
 */
export function updateTradeStatus(
  id: string,
  status: "open" | "closed" | "expired"
): void {
  updateTradeStatusStmt.run({
    $id: id,
    $status: status,
    $updated_at: new Date().toISOString(),
  });
}

/**
 * Get the raw trade row with all fields (for internal use)
 */
export function getTradeRow(id: string): TradeRow | null {
  return selectTradeById.get(id) as TradeRow | null;
}

/**
 * Get trade statistics
 */
export function getTradeStats(): {
  total: number;
  open: number;
  closed: number;
  expired: number;
} {
  const countByStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM trades GROUP BY status
  `).all() as Array<{ status: string; count: number }>;

  const stats = { total: 0, open: 0, closed: 0, expired: 0 };
  for (const row of countByStatus) {
    stats.total += row.count;
    if (row.status === "open") stats.open = row.count;
    if (row.status === "closed") stats.closed = row.count;
    if (row.status === "expired") stats.expired = row.count;
  }

  return stats;
}

/**
 * Close the database connection (for cleanup)
 */
export function closeDb(): void {
  db.close();
}

// ============================================================================
// API KEYS API
// ============================================================================

export interface ApiKeyRow {
  id: string;
  key_hash: string;
  user_id: string;
  tier: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: number;
}

export function saveApiKey(
  id: string,
  keyHash: string,
  userId: string,
  tier: "free" | "paid",
  expiresAt?: string
): void {
  insertApiKey.run({
    $id: id,
    $key_hash: keyHash,
    $user_id: userId,
    $tier: tier,
    $created_at: new Date().toISOString(),
    $expires_at: expiresAt || null,
    $is_active: 1,
  });
}

export function getApiKeyByHash(keyHash: string): ApiKeyRow | null {
  return selectApiKeyByHash.get(keyHash) as ApiKeyRow | null;
}

export function getApiKeysByUser(userId: string): ApiKeyRow[] {
  return selectApiKeysByUser.all(userId) as ApiKeyRow[];
}

export function updateApiKeyUsage(keyId: string): void {
  updateApiKeyLastUsed.run(new Date().toISOString(), keyId);
}

export function revokeApiKey(keyId: string): void {
  deactivateApiKey.run(keyId);
}

// ============================================================================
// SUBSCRIPTIONS API
// ============================================================================

export interface SubscriptionRow {
  id: string;
  user_id: string;
  tier: string;
  status: string;
  amount_cents: number;
  billing_period: string;
  started_at: string;
  expires_at: string | null;
}

export function saveSubscription(
  id: string,
  userId: string,
  tier: "free" | "paid",
  amountCents: number = 500,
  billingPeriod: "weekly" | "monthly" = "weekly",
  expiresAt?: string
): void {
  insertSubscription.run({
    $id: id,
    $user_id: userId,
    $tier: tier,
    $status: "active",
    $amount_cents: amountCents,
    $billing_period: billingPeriod,
    $started_at: new Date().toISOString(),
    $expires_at: expiresAt || null,
  });
}

export function getActiveSubscription(userId: string): SubscriptionRow | null {
  return selectSubscriptionByUser.get(userId) as SubscriptionRow | null;
}

export function cancelSubscription(subscriptionId: string): void {
  updateSubscriptionStatus.run("cancelled", subscriptionId);
}

// ============================================================================
// SIGNALS API
// ============================================================================

export interface SignalRow {
  id: string;
  trade_id: string | null;
  ticker: string;
  direction: string;
  platform: string;
  confidence: number | null;
  entry_price: number | null;
  headline_quote: string | null;
  execution_priority: string | null;
  published_at: string;
  delayed_until: string | null;
}

export function saveSignal(signal: {
  id: string;
  trade_id?: string;
  ticker: string;
  direction: string;
  platform: string;
  confidence?: number;
  entry_price?: number;
  headline_quote?: string;
  execution_priority?: string[];
  published_at: string;
  delayed_until?: string;
}): void {
  insertSignal.run({
    $id: signal.id,
    $trade_id: signal.trade_id || null,
    $ticker: signal.ticker,
    $direction: signal.direction,
    $platform: signal.platform,
    $confidence: signal.confidence ?? null,
    $entry_price: signal.entry_price ?? null,
    $headline_quote: signal.headline_quote || null,
    $execution_priority: signal.execution_priority ? JSON.stringify(signal.execution_priority) : null,
    $published_at: signal.published_at,
    $delayed_until: signal.delayed_until || null,
  });
}

export function getRecentSignals(limit: number = 50): SignalRow[] {
  return selectRecentSignals.all(limit) as SignalRow[];
}

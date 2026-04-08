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

// ============================================================================
// USERS & AUTH TABLES
// ============================================================================

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS magic_links (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_magic_links_token_hash ON magic_links(token_hash)`);

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
// NEWS TABLE
// ============================================================================

db.run(`
  CREATE TABLE IF NOT EXISTS news (
    id TEXT PRIMARY KEY,
    headline TEXT NOT NULL,
    summary TEXT,
    source TEXT NOT NULL,
    source_type TEXT NOT NULL,
    author TEXT,
    author_handle TEXT,
    author_avatar TEXT,
    url TEXT,
    sentiment TEXT,
    assets TEXT,
    published_at TEXT NOT NULL
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at)`);

// ============================================================================
// MOCK TRADES TABLE
// ============================================================================

db.run(`
  CREATE TABLE IF NOT EXISTS mock_trades (
    id TEXT PRIMARY KEY,
    user_name TEXT NOT NULL,
    user_avatar TEXT,
    news_id TEXT,
    news_headline TEXT,
    ticker TEXT NOT NULL,
    direction TEXT NOT NULL,
    platform TEXT NOT NULL,
    entry_price REAL NOT NULL,
    exit_price REAL,
    pnl_usd REAL NOT NULL,
    pnl_pct REAL NOT NULL,
    position_size REAL NOT NULL,
    traded_at TEXT NOT NULL,
    closed_at TEXT
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_mock_trades_traded_at ON mock_trades(traded_at)`);

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

// ============================================================================
// USERS & AUTH API
// ============================================================================

export interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_login_at: string | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
}

export interface MagicLinkRow {
  id: string;
  email: string;
  token_hash: string;
  expires_at: string;
  used: number;
  created_at: string;
}

// Users
const insertUser = db.prepare(`
  INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)
`);
const selectUserByEmail = db.prepare(`SELECT * FROM users WHERE email = ?`);
const selectUserById = db.prepare(`SELECT * FROM users WHERE id = ?`);
const updateUserLastLogin = db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`);

export function createUser(id: string, email: string): void {
  insertUser.run(id, email.toLowerCase(), new Date().toISOString());
}

export function getUserByEmail(email: string): UserRow | null {
  return selectUserByEmail.get(email.toLowerCase()) as UserRow | null;
}

export function getUserById(id: string): UserRow | null {
  return selectUserById.get(id) as UserRow | null;
}

export function updateLastLogin(userId: string): void {
  updateUserLastLogin.run(new Date().toISOString(), userId);
}

// Sessions
const insertSession = db.prepare(`
  INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)
`);
const selectSessionByTokenHash = db.prepare(`
  SELECT * FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')
`);
const deleteSession = db.prepare(`DELETE FROM sessions WHERE id = ?`);
const deleteUserSessions = db.prepare(`DELETE FROM sessions WHERE user_id = ?`);
const deleteExpiredSessions = db.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`);

export function createSession(id: string, userId: string, tokenHash: string, expiresAt: string): void {
  insertSession.run(id, userId, tokenHash, expiresAt, new Date().toISOString());
}

export function getSessionByTokenHash(tokenHash: string): SessionRow | null {
  return selectSessionByTokenHash.get(tokenHash) as SessionRow | null;
}

export function deleteSessionById(sessionId: string): void {
  deleteSession.run(sessionId);
}

export function deleteAllUserSessions(userId: string): void {
  deleteUserSessions.run(userId);
}

export function cleanExpiredSessions(): void {
  deleteExpiredSessions.run();
}

// Magic Links
const insertMagicLink = db.prepare(`
  INSERT INTO magic_links (id, email, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)
`);
const selectMagicLinkByTokenHash = db.prepare(`
  SELECT * FROM magic_links WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')
`);
const markMagicLinkUsed = db.prepare(`UPDATE magic_links SET used = 1 WHERE id = ?`);
const deleteExpiredMagicLinks = db.prepare(`DELETE FROM magic_links WHERE expires_at <= datetime('now')`);

export function createMagicLink(id: string, email: string, tokenHash: string, expiresAt: string): void {
  insertMagicLink.run(id, email.toLowerCase(), tokenHash, expiresAt, new Date().toISOString());
}

export function getMagicLinkByTokenHash(tokenHash: string): MagicLinkRow | null {
  return selectMagicLinkByTokenHash.get(tokenHash) as MagicLinkRow | null;
}

export function useMagicLink(linkId: string): void {
  markMagicLinkUsed.run(linkId);
}

export function cleanExpiredMagicLinks(): void {
  deleteExpiredMagicLinks.run();
}

// Link API keys to authenticated users (update user_id in api_keys)
const updateApiKeyUserId = db.prepare(`UPDATE api_keys SET user_id = ? WHERE user_id = ?`);

export function migrateApiKeysToUser(oldUserId: string, newUserId: string): void {
  updateApiKeyUserId.run(newUserId, oldUserId);
}

// Link subscriptions to authenticated users
const updateSubscriptionUserId = db.prepare(`UPDATE subscriptions SET user_id = ? WHERE user_id = ?`);

export function migrateSubscriptionsToUser(oldUserId: string, newUserId: string): void {
  updateSubscriptionUserId.run(newUserId, oldUserId);
}

// ============================================================================
// NEWS API
// ============================================================================

export interface NewsRow {
  id: string;
  headline: string;
  summary: string | null;
  source: string;
  source_type: string;
  author: string | null;
  author_handle: string | null;
  author_avatar: string | null;
  url: string | null;
  sentiment: string | null;
  assets: string | null;
  published_at: string;
}

const insertNews = db.prepare(`
  INSERT INTO news (id, headline, summary, source, source_type, author, author_handle, author_avatar, url, sentiment, assets, published_at)
  VALUES ($id, $headline, $summary, $source, $source_type, $author, $author_handle, $author_avatar, $url, $sentiment, $assets, $published_at)
`);

const selectRecentNews = db.prepare(`
  SELECT * FROM news ORDER BY published_at DESC LIMIT ?
`);

export function saveNews(news: {
  id: string;
  headline: string;
  summary?: string;
  source: string;
  source_type: string;
  author?: string;
  author_handle?: string;
  author_avatar?: string;
  url?: string;
  sentiment?: string;
  assets?: string[];
  published_at: string;
}): void {
  insertNews.run({
    $id: news.id,
    $headline: news.headline,
    $summary: news.summary || null,
    $source: news.source,
    $source_type: news.source_type,
    $author: news.author || null,
    $author_handle: news.author_handle || null,
    $author_avatar: news.author_avatar || null,
    $url: news.url || null,
    $sentiment: news.sentiment || null,
    $assets: news.assets ? JSON.stringify(news.assets) : null,
    $published_at: news.published_at,
  });
}

export function getRecentNews(limit: number = 50): NewsRow[] {
  return selectRecentNews.all(limit) as NewsRow[];
}

// ============================================================================
// MOCK TRADES API
// ============================================================================

export interface MockTradeRow {
  id: string;
  user_name: string;
  user_avatar: string | null;
  news_id: string | null;
  news_headline: string | null;
  ticker: string;
  direction: string;
  platform: string;
  entry_price: number;
  exit_price: number | null;
  pnl_usd: number;
  pnl_pct: number;
  position_size: number;
  traded_at: string;
  closed_at: string | null;
}

const insertMockTrade = db.prepare(`
  INSERT INTO mock_trades (id, user_name, user_avatar, news_id, news_headline, ticker, direction, platform, entry_price, exit_price, pnl_usd, pnl_pct, position_size, traded_at, closed_at)
  VALUES ($id, $user_name, $user_avatar, $news_id, $news_headline, $ticker, $direction, $platform, $entry_price, $exit_price, $pnl_usd, $pnl_pct, $position_size, $traded_at, $closed_at)
`);

const selectRecentMockTrades = db.prepare(`
  SELECT * FROM mock_trades ORDER BY traded_at DESC LIMIT ?
`);

export function saveMockTrade(trade: {
  id: string;
  user_name: string;
  user_avatar?: string;
  news_id?: string;
  news_headline?: string;
  ticker: string;
  direction: string;
  platform: string;
  entry_price: number;
  exit_price?: number;
  pnl_usd: number;
  pnl_pct: number;
  position_size: number;
  traded_at: string;
  closed_at?: string;
}): void {
  insertMockTrade.run({
    $id: trade.id,
    $user_name: trade.user_name,
    $user_avatar: trade.user_avatar || null,
    $news_id: trade.news_id || null,
    $news_headline: trade.news_headline || null,
    $ticker: trade.ticker,
    $direction: trade.direction,
    $platform: trade.platform,
    $entry_price: trade.entry_price,
    $exit_price: trade.exit_price ?? null,
    $pnl_usd: trade.pnl_usd,
    $pnl_pct: trade.pnl_pct,
    $position_size: trade.position_size,
    $traded_at: trade.traded_at,
    $closed_at: trade.closed_at || null,
  });
}

export function getRecentMockTrades(limit: number = 50): MockTradeRow[] {
  return selectRecentMockTrades.all(limit) as MockTradeRow[];
}

// ============================================================================
// SEED MOCK DATA
// ============================================================================

export function seedMockData(): void {
  // Check if mock data already exists
  const existingNews = getRecentNews(1);
  if (existingNews.length > 0) return;

  const now = new Date();

  // Sample news items - matching the trade theses
  const newsItems = [
    {
      id: "news_001",
      headline: "BTC bottom call - $60k Oct 2021 close level = major institutional bid",
      summary: "Oct 2021 monthly close (~$60k) = major institutional bid level. Purple POI + 1.272-1.34 fib silver pocket converge same zone. 8 weeks holding the level + hash ribbon confirm = BTC long.",
      source: "Twitter",
      source_type: "twitter",
      author: "astronomer_zero",
      author_handle: "astronomer_zero",
      sentiment: "bullish",
      assets: ["BTC"],
      published_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "news_002",
      headline: "BTC bottom call - Binance whales stacked 45k BTC in 48 hours",
      summary: "Massive accumulation detected on-chain. Whale wallets adding significant positions at $58-60k range. Classic distribution-to-accumulation pattern.",
      source: "Twitter",
      source_type: "twitter",
      author: "whale_alert",
      author_handle: "whale_alert",
      sentiment: "bullish",
      assets: ["BTC"],
      published_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "news_003",
      headline: "Institutional money is flowing into the Treasury trade - GLD short",
      summary: "Risk-off rotation into treasuries. Gold losing safe haven bid as real yields rise. Institutional flows favor bonds over gold in current macro environment.",
      source: "Twitter",
      source_type: "twitter",
      author: "gold_macro",
      author_handle: "gold_macro",
      sentiment: "bearish",
      assets: ["GLD"],
      published_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "news_004",
      headline: "ETH/BTC ratio at 4-year low - mean reversion incoming",
      summary: "ETH severely undervalued vs BTC. Historical pattern suggests 30%+ catch-up move when ratio overshoots to this extent. Dencun upgrade catalyst approaching.",
      source: "Twitter",
      source_type: "twitter",
      author: "eth_maxi",
      author_handle: "eth_maxi",
      sentiment: "bullish",
      assets: ["ETH"],
      published_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "news_005",
      headline: "SOL flipping ETH in daily active users - breakout imminent",
      summary: "Solana ecosystem growing rapidly. Daily active addresses surpassed Ethereum for first time. Jupiter, Marinade seeing record volumes. Technical breakout above $130 confirms trend.",
      source: "Twitter",
      source_type: "twitter",
      author: "sol_chad",
      author_handle: "sol_chad",
      sentiment: "bullish",
      assets: ["SOL"],
      published_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "news_006",
      headline: "Exchange FUD = buy signal - retail panic, whales accumulate",
      summary: "Every major exchange FUD event in history has been a buying opportunity. Whales use panic to accumulate at discount. Classic contrarian setup.",
      source: "Twitter",
      source_type: "twitter",
      author: "bear_hunter",
      author_handle: "bear_hunter",
      sentiment: "bullish",
      assets: ["BTC"],
      published_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  // Sample mock trades with attribution - high conviction trades with big P&L
  const mockTrades = [
    {
      id: "mt_001",
      user_name: "astronomer_zero",
      news_id: "news_001",
      news_headline: "BTC bottom call - $60k Oct 2021 close level = major institutional bid",
      ticker: "BTC-PERP",
      direction: "long",
      platform: "hyperliquid",
      entry_price: 60500,
      exit_price: 82800,
      pnl_usd: 36900,
      pnl_pct: 37,
      position_size: 100000,
      traded_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      closed_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: "mt_002",
      user_name: "whale_alert",
      news_id: "news_002",
      news_headline: "BTC bottom call - Binance whales stacked 45k BTC in 48 hours",
      ticker: "BTC-PERP",
      direction: "long",
      platform: "hyperliquid",
      entry_price: 58200,
      exit_price: 80900,
      pnl_usd: 19500,
      pnl_pct: 39,
      position_size: 50000,
      traded_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      closed_at: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "mt_003",
      user_name: "gold_macro",
      news_id: "news_003",
      news_headline: "Institutional money is flowing into the Treasury trade - GLD short",
      ticker: "GLD",
      direction: "short",
      platform: "hyperliquid",
      entry_price: 235.50,
      exit_price: 187.40,
      pnl_usd: 97800,
      pnl_pct: 489,
      position_size: 20000,
      traded_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      closed_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "mt_004",
      user_name: "eth_maxi",
      news_id: "news_004",
      news_headline: "ETH/BTC ratio at 4-year low - mean reversion incoming",
      ticker: "ETH-PERP",
      direction: "long",
      platform: "hyperliquid",
      entry_price: 2850,
      exit_price: 3420,
      pnl_usd: 3000,
      pnl_pct: 20,
      position_size: 15000,
      traded_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      closed_at: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "mt_005",
      user_name: "sol_chad",
      news_id: "news_005",
      news_headline: "SOL flipping ETH in daily active users - breakout imminent",
      ticker: "SOL-PERP",
      direction: "long",
      platform: "hyperliquid",
      entry_price: 125,
      exit_price: 168,
      pnl_usd: 8600,
      pnl_pct: 34,
      position_size: 25000,
      traded_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      closed_at: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "mt_006",
      user_name: "bear_hunter",
      news_id: "news_006",
      news_headline: "Exchange FUD = buy signal - retail panic, whales accumulate",
      ticker: "BTC-PERP",
      direction: "long",
      platform: "hyperliquid",
      entry_price: 64500,
      exit_price: 72300,
      pnl_usd: 9360,
      pnl_pct: 12,
      position_size: 80000,
      traded_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      closed_at: new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString(),
    },
  ];

  // Insert news
  for (const news of newsItems) {
    try {
      saveNews(news);
    } catch (e) {
      // Ignore duplicates
    }
  }

  // Insert mock trades
  for (const trade of mockTrades) {
    try {
      saveMockTrade(trade);
    } catch (e) {
      // Ignore duplicates
    }
  }

  console.log("[storage] Seeded mock news and trades data");
}

/**
 * Signal Trade - Core Type Definitions
 */

// ============================================================================
// ENUMS
// ============================================================================

export type Platform = "hyperliquid" | "polymarket" | "okx";
export type Direction = "long" | "short" | "yes" | "no";
export type Liquidity = "high" | "medium" | "low";
export type ThesisDirection = "bullish" | "bearish" | "neutral";
export type SourceType = "youtube" | "twitter" | "article" | "pdf" | "screenshot" | "text";
export type TradeType = "direct" | "derived" | "proxy";
export type ThesisStatus = "saved" | "routing" | "routed" | "dropped" | "posted";

// ============================================================================
// SOURCE EXTRACTION
// ============================================================================

export interface ExtractedSource {
  url: string;
  source_type: SourceType;
  title?: string;
  author?: string;
  author_handle?: string;
  author_avatar?: string;
  publish_date?: string;
  word_count?: number;
  duration_seconds?: number;
  text: string;
  transcript?: string;
  images?: string[];
  metadata?: Record<string, unknown>;
}

export interface ExtractionResult {
  success: boolean;
  source?: ExtractedSource;
  error?: string;
}

// ============================================================================
// THESIS EXTRACTION
// ============================================================================

export interface Thesis {
  id: string;
  thesis_text: string;
  direction: ThesisDirection;
  horizon?: string; // e.g., "1 week", "3 months", "end of year"
  time_horizon?: string; // alias for horizon
  confidence: number; // 0-1
  supporting_quotes: Quote[];
  keywords?: string[];
  sectors?: string[];
  status: ThesisStatus;
  created_at: string;
  run_id?: string;
}

export interface Quote {
  text: string;
  start_index?: number;
  attribution?: string;
}

// ============================================================================
// INSTRUMENT DISCOVERY
// ============================================================================

export interface InstrumentMatch {
  ticker: string;
  name: string;
  platform: Platform;
  instrument_type: "perp" | "spot" | "prediction" | "equity";
  relevance: "direct" | "proxy" | "lateral";
  explanation: string;
  liquidity: Liquidity;
  resolution_date?: string; // For prediction markets
}

export interface DiscoveryResult {
  query: string;
  matches: InstrumentMatch[];
  platforms_searched: Platform[];
}

// ============================================================================
// ROUTING
// ============================================================================

export interface RouteEvidence {
  thesis_id: string;
  routed_ticker: string;
  platform: Platform;
  instrument_type: string;
  direction: Direction;
  trade_type: TradeType;
  author_price?: number;
  posted_price?: number;
  price_timestamp?: string;
  selection_reason: string;
  alternatives?: InstrumentMatch[];
  derivation: Derivation;
}

export interface Derivation {
  headline_quote: string;
  explanation: string;
  steps: DerivationStep[];
  candidate_comparison?: CandidateComparison[];
}

export interface DerivationStep {
  step_number: number;
  text: string; // Max 70 chars, headline style
  citation?: string;
}

export interface CandidateComparison {
  ticker: string;
  platform: Platform;
  pros: string[];
  cons: string[];
  selected: boolean;
}

// ============================================================================
// TRADE POSTING
// ============================================================================

export interface TradePost {
  id: string;
  thesis_id: string;
  ticker: string;
  direction: Direction;
  platform: Platform;
  instrument_type: string;
  trade_type: TradeType;
  headline_quote: string;
  author_price: number;
  posted_price: number;
  author: string;
  author_handle?: string;
  author_avatar?: string;
  source_url: string;
  source_date: string;
  derivation: Derivation;
  posted_at: string;
}

// ============================================================================
// P&L TRACKING
// ============================================================================

export interface TrackedTrade {
  trade_id: string;
  thesis_id: string;
  ticker: string;
  direction: Direction;
  platform: Platform;
  entry_price: number;
  current_price?: number;
  author_pnl?: number;
  posted_pnl?: number;
  status: "open" | "closed" | "expired";
  opened_at: string;
  closed_at?: string;
}

export interface PnlResult {
  author_pnl_pct: number | null;
  posted_pnl_pct: number | null;
  current_price: number;
  movement_since_publish: number;
}

// ============================================================================
// STREAMING EVENTS
// ============================================================================

export type EventType =
  | "extraction_started"
  | "extraction_complete"
  | "thesis_saved"
  | "thesis_routing"
  | "thesis_routed"
  | "thesis_dropped"
  | "trade_posted"
  | "source_complete"
  | "error";

export interface StreamEvent {
  type: EventType;
  thesis_id?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
}

// ============================================================================
// VENUE ADAPTER INTERFACE
// ============================================================================

export interface VenueAdapter {
  platform: Platform;

  // Discovery
  searchInstruments(query: string): Promise<InstrumentMatch[]>;
  validateTicker(ticker: string): Promise<boolean>;

  // Pricing
  getCurrentPrice(ticker: string): Promise<number | null>;
  getHistoricalPrice(ticker: string, timestamp: string): Promise<number | null>;

  // Instrument details
  getInstrumentDetails(ticker: string): Promise<InstrumentDetails | null>;
}

export interface InstrumentDetails {
  ticker: string;
  name: string;
  platform: Platform;
  instrument_type: string;
  liquidity: Liquidity;
  volume_24h?: number;
  open_interest?: number;
  funding_rate?: number;
  leverage_max?: number;
  resolution_date?: string;
}

// ============================================================================
// FEED SYSTEM
// ============================================================================

export interface FeedSignal {
  id: string;
  trade_id?: string;
  ticker: string;
  direction: Direction;
  platform: Platform;
  confidence: number;
  entry_price: number;
  headline_quote?: string;
  execution_priority: Platform[];
  published_at: string;
  delayed_until?: string;
}

export type ApiKeyTier = "free" | "paid";

export interface ApiKey {
  id: string;
  user_id: string;
  tier: ApiKeyTier;
  created_at: string;
  expires_at?: string;
  last_used_at?: string;
  is_active: boolean;
}

export interface Subscription {
  id: string;
  user_id: string;
  tier: ApiKeyTier;
  status: "active" | "cancelled" | "expired";
  amount_cents: number;
  billing_period: "weekly" | "monthly";
  started_at: string;
  expires_at?: string;
}

export type FeedEventType = "signal" | "news" | "heartbeat" | "error" | "connected";

export interface FeedEvent {
  type: FeedEventType;
  data?: FeedSignal | FeedNewsItem | Record<string, unknown>;
  timestamp: string;
}

// ============================================================================
// NEWS FEED
// ============================================================================

export interface FeedNewsItem {
  id: string;
  headline: string;
  summary?: string;
  source: string;
  source_type: "twitter" | "youtube" | "news" | "custom";
  author?: string;
  author_handle?: string;
  author_avatar?: string;
  url?: string;
  sentiment?: "bullish" | "bearish" | "neutral";
  assets?: string[]; // Mentioned assets like BTC, ETH
  published_at: string;
}

// ============================================================================
// MOCK TRADES WITH ATTRIBUTION
// ============================================================================

export interface MockTrade {
  id: string;
  user_name: string;
  user_avatar?: string;
  news_id: string;
  news_headline: string;
  ticker: string;
  direction: Direction;
  platform: Platform;
  entry_price: number;
  exit_price?: number;
  pnl_usd: number;
  pnl_pct: number;
  position_size: number;
  traded_at: string;
  closed_at?: string;
}

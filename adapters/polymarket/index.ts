/**
 * Signal Trade - Polymarket Adapter
 *
 * Integration with Polymarket prediction markets
 * - Market discovery via Gamma API
 * - Pricing via CLOB endpoints
 * - Resolution tracking
 */

import type {
  VenueAdapter,
  InstrumentMatch,
  InstrumentDetails,
  Liquidity,
} from "../../types";

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const CLOB_API_BASE = "https://clob.polymarket.com";

// ============================================================================
// TYPES
// ============================================================================

interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  resolutionSource: string;
  endDate: string;
  liquidity: string;
  volume: string;
  volume24hr: string;
  outcomePrices: string; // JSON array string: "[0.65, 0.35]"
  outcomes: string; // JSON array string: '["Yes", "No"]'
  active: boolean;
  closed: boolean;
  new: boolean;
  featured: boolean;
  archived: boolean;
  clobTokenIds: string; // JSON array string: "[123, 456]"
}

interface ClobBook {
  market: string;
  asset_id: string;
  timestamp: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

// ============================================================================
// API CALLS
// ============================================================================

async function fetchGammaMarkets(params: Record<string, string>): Promise<GammaMarket[]> {
  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${GAMMA_API_BASE}/markets?${queryString}`);

    if (!response.ok) {
      console.error(`Gamma API error: ${response.status}`);
      return [];
    }

    return response.json();
  } catch (e) {
    console.error("Gamma API call failed:", e);
    return [];
  }
}

async function fetchClobBook(tokenId: string): Promise<ClobBook | null> {
  try {
    const response = await fetch(`${CLOB_API_BASE}/book?token_id=${tokenId}`);

    if (!response.ok) return null;

    return response.json();
  } catch (e) {
    console.error("[fetchClobBook] Error:", e);
    return null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function parseJsonField<T>(field: string, fallback: T): T {
  try {
    return JSON.parse(field);
  } catch {
    return fallback;
  }
}

function classifyLiquidity(volume: number, liquidity: number): Liquidity {
  if (volume > 1_000_000 || liquidity > 100_000) return "high";
  if (volume > 100_000 || liquidity > 10_000) return "medium";
  return "low";
}

// ============================================================================
// INSTRUMENT SEARCH
// ============================================================================

export async function searchInstruments(query: string): Promise<InstrumentMatch[]> {
  const markets = await fetchGammaMarkets({
    _limit: "30",
    active: "true",
    closed: "false",
    _q: query,
  });

  const matches: InstrumentMatch[] = [];

  for (const market of markets) {
    if (!market.active || market.closed || market.archived) continue;

    const volume = parseFloat(market.volume) || 0;
    const liquidity = parseFloat(market.liquidity) || 0;

    // Parse outcomes and prices
    const outcomes = parseJsonField<string[]>(market.outcomes, ["Yes", "No"]);
    const prices = parseJsonField<number[]>(market.outcomePrices, [0.5, 0.5]);

    // Determine relevance based on query match
    const questionLower = market.question.toLowerCase();
    const queryLower = query.toLowerCase();
    let relevance: "direct" | "proxy" | "lateral" = "lateral";

    if (questionLower.includes(queryLower)) {
      relevance = "direct";
    } else {
      // Check for related keywords
      const keywords = queryLower.split(/\s+/);
      const matches = keywords.filter((k) => questionLower.includes(k));
      if (matches.length > 0) {
        relevance = "proxy";
      }
    }

    matches.push({
      ticker: market.conditionId,
      name: market.question.slice(0, 100),
      platform: "polymarket",
      instrument_type: "prediction",
      relevance,
      explanation: `Prediction market: "${market.question}" - Current YES: ${(prices[0] * 100).toFixed(0)}%`,
      liquidity: classifyLiquidity(volume, liquidity),
      resolution_date: market.endDate,
    });
  }

  // Sort by volume (higher = more relevant)
  matches.sort((a, b) => {
    const volA = parseFloat(markets.find(m => m.conditionId === a.ticker)?.volume || "0");
    const volB = parseFloat(markets.find(m => m.conditionId === b.ticker)?.volume || "0");
    return volB - volA;
  });

  return matches;
}

// ============================================================================
// PRICING
// ============================================================================

export async function getCurrentPrice(conditionId: string): Promise<number | null> {
  // Fetch market by condition ID
  const markets = await fetchGammaMarkets({ conditionId });

  if (markets.length === 0) return null;

  const market = markets[0];
  const prices = parseJsonField<number[]>(market.outcomePrices, []);

  if (prices.length === 0) return null;

  // Return YES price
  return prices[0];
}

export async function getHistoricalPrice(
  _conditionId: string,
  _timestamp: string
): Promise<number | null> {
  // Polymarket doesn't have a public historical price API
  // Polymarket is a prediction market, not a price oracle
  // Historical prices would need to be tracked over time
  console.warn("[polymarket] Historical pricing not available for prediction markets");
  return null;
}

// ============================================================================
// INSTRUMENT DETAILS
// ============================================================================

export async function getInstrumentDetails(
  conditionId: string
): Promise<InstrumentDetails | null> {
  const markets = await fetchGammaMarkets({ conditionId });

  if (markets.length === 0) return null;

  const market = markets[0];
  const volume = parseFloat(market.volume) || 0;
  const volume24h = parseFloat(market.volume24hr) || 0;
  const liquidity = parseFloat(market.liquidity) || 0;

  return {
    ticker: market.conditionId,
    name: market.question,
    platform: "polymarket",
    instrument_type: "prediction",
    liquidity: classifyLiquidity(volume, liquidity),
    volume_24h: volume24h,
    resolution_date: market.endDate,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

export async function validateTicker(conditionId: string): Promise<boolean> {
  const markets = await fetchGammaMarkets({ conditionId });
  return markets.length > 0 && markets[0].active && !markets[0].closed;
}

// ============================================================================
// ADAPTER EXPORT
// ============================================================================

export const polymarketAdapter: VenueAdapter = {
  platform: "polymarket",
  searchInstruments,
  validateTicker,
  getCurrentPrice,
  getHistoricalPrice,
  getInstrumentDetails,
};

export default polymarketAdapter;

/**
 * Signal Trade - Hyperliquid Adapter
 *
 * Integration with Hyperliquid perpetual futures exchange
 * - Instrument discovery via universe endpoint
 * - Real-time pricing via allMids
 * - Historical pricing via candles
 */

import type {
  VenueAdapter,
  InstrumentMatch,
  InstrumentDetails,
  Liquidity,
} from "../../types";

const HL_API_BASE = "https://api.hyperliquid.xyz";

// ============================================================================
// TYPES
// ============================================================================

interface HlAsset {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
}

interface HlMeta {
  universe: HlAsset[];
}

interface HlAssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium?: string;
  oraclePx: string;
  markPx: string;
}

interface HlMetaAndAssetCtxs {
  meta: HlMeta;
  assetCtxs: HlAssetCtx[];
}

interface HlCandle {
  t: number; // timestamp ms
  T: number; // close timestamp ms
  s: string; // symbol
  i: string; // interval
  o: string; // open
  c: string; // close
  h: string; // high
  l: string; // low
  v: string; // volume
  n: number; // trades
}

// ============================================================================
// CACHING
// ============================================================================

let universeCache: HlAsset[] | null = null;
let universeCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

// ============================================================================
// API CALLS
// ============================================================================

async function fetchInfo<T>(body: object): Promise<T | null> {
  try {
    const response = await fetch(`${HL_API_BASE}/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`Hyperliquid API error: ${response.status}`);
      return null;
    }

    return response.json();
  } catch (e) {
    console.error("Hyperliquid API call failed:", e);
    return null;
  }
}

async function fetchUniverse(): Promise<HlAsset[]> {
  const now = Date.now();
  if (universeCache && now - universeCacheTime < CACHE_TTL_MS) {
    return universeCache;
  }

  const data = await fetchInfo<HlMeta>({ type: "meta" });
  if (data?.universe) {
    universeCache = data.universe;
    universeCacheTime = now;
    return data.universe;
  }
  return [];
}

async function fetchMetaAndAssetCtxs(): Promise<HlMetaAndAssetCtxs | null> {
  return fetchInfo<HlMetaAndAssetCtxs>({ type: "metaAndAssetCtxs" });
}

async function fetchAllMids(): Promise<Record<string, string> | null> {
  return fetchInfo<Record<string, string>>({ type: "allMids" });
}

async function fetchCandles(
  coin: string,
  interval: string,
  startTime: number,
  endTime?: number
): Promise<HlCandle[]> {
  const body: Record<string, unknown> = {
    type: "candleSnapshot",
    req: {
      coin,
      interval,
      startTime,
      endTime: endTime || Date.now(),
    },
  };

  const data = await fetchInfo<HlCandle[]>(body);
  return data || [];
}

// ============================================================================
// INSTRUMENT SEARCH
// ============================================================================

function classifyLiquidity(volume24h: number, openInterest: number): Liquidity {
  if (volume24h > 100_000_000 || openInterest > 50_000_000) return "high";
  if (volume24h > 10_000_000 || openInterest > 5_000_000) return "medium";
  return "low";
}

export async function searchInstruments(query: string): Promise<InstrumentMatch[]> {
  const universe = await fetchUniverse();
  const queryLower = query.toLowerCase();
  const matches: InstrumentMatch[] = [];

  // Ticker aliases
  const aliases: Record<string, string[]> = {
    bitcoin: ["BTC"],
    ethereum: ["ETH"],
    solana: ["SOL"],
    gold: ["XAU"],
    silver: ["XAG"],
    oil: ["WTI"],
    spy: ["SPY"],
    nasdaq: ["NQ"],
    apple: ["AAPL"],
    nvidia: ["NVDA"],
    tesla: ["TSLA"],
  };

  const expandedQueries = [queryLower];
  for (const [key, values] of Object.entries(aliases)) {
    if (queryLower.includes(key)) {
      expandedQueries.push(...values.map((v) => v.toLowerCase()));
    }
  }

  for (const asset of universe) {
    const assetLower = asset.name.toLowerCase();

    for (const q of expandedQueries) {
      if (assetLower.includes(q) || q.includes(assetLower)) {
        let relevance: "direct" | "proxy" | "lateral" = "lateral";
        if (assetLower === q || asset.name.toUpperCase() === query.toUpperCase()) {
          relevance = "direct";
        } else if (q === queryLower) {
          relevance = "proxy";
        }

        // Estimate liquidity from leverage (proxy)
        let liquidity: Liquidity = "medium";
        if (asset.maxLeverage >= 50) liquidity = "high";
        else if (asset.maxLeverage <= 10) liquidity = "low";

        matches.push({
          ticker: asset.name,
          name: `${asset.name} Perpetual`,
          platform: "hyperliquid",
          instrument_type: "perp",
          relevance,
          explanation: `${asset.name} perpetual on Hyperliquid, ${asset.maxLeverage}x max leverage`,
          liquidity,
        });
        break;
      }
    }
  }

  return matches;
}

// ============================================================================
// PRICING
// ============================================================================

export async function getCurrentPrice(ticker: string): Promise<number | null> {
  const mids = await fetchAllMids();
  if (!mids || !mids[ticker]) return null;
  return parseFloat(mids[ticker]);
}

export async function getHistoricalPrice(
  ticker: string,
  timestamp: string
): Promise<number | null> {
  const targetTime = new Date(timestamp).getTime();
  const startTime = targetTime - 60 * 60 * 1000; // 1 hour before

  const candles = await fetchCandles(ticker, "1h", startTime, targetTime);
  if (candles.length === 0) return null;

  // Find closest candle
  let closest = candles[0];
  let minDiff = Math.abs(closest.t - targetTime);

  for (const candle of candles) {
    const diff = Math.abs(candle.t - targetTime);
    if (diff < minDiff) {
      closest = candle;
      minDiff = diff;
    }
  }

  return parseFloat(closest.c);
}

// ============================================================================
// INSTRUMENT DETAILS
// ============================================================================

export async function getInstrumentDetails(
  ticker: string
): Promise<InstrumentDetails | null> {
  const data = await fetchMetaAndAssetCtxs();
  if (!data) return null;

  const assetIdx = data.meta.universe.findIndex((a) => a.name === ticker);
  if (assetIdx === -1) return null;

  const asset = data.meta.universe[assetIdx];
  const ctx = data.assetCtxs[assetIdx];

  const volume24h = parseFloat(ctx.dayNtlVlm) || 0;
  const openInterest = parseFloat(ctx.openInterest) || 0;
  const fundingRate = parseFloat(ctx.funding) || 0;

  return {
    ticker: asset.name,
    name: `${asset.name} Perpetual`,
    platform: "hyperliquid",
    instrument_type: "perp",
    liquidity: classifyLiquidity(volume24h, openInterest),
    volume_24h: volume24h,
    open_interest: openInterest,
    funding_rate: fundingRate,
    leverage_max: asset.maxLeverage,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

export async function validateTicker(ticker: string): Promise<boolean> {
  const universe = await fetchUniverse();
  return universe.some((a) => a.name === ticker);
}

// ============================================================================
// ADAPTER EXPORT
// ============================================================================

export const hyperliquidAdapter: VenueAdapter = {
  platform: "hyperliquid",
  searchInstruments,
  validateTicker,
  getCurrentPrice,
  getHistoricalPrice,
  getInstrumentDetails,
};

export default hyperliquidAdapter;

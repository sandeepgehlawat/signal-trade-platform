#!/usr/bin/env bun
/**
 * Signal Trade - Instrument Discovery
 *
 * Searches trading venues for instruments matching a query:
 * - Hyperliquid (perpetual futures)
 * - Polymarket (prediction markets)
 * - OKX OnchainOS (crypto trading)
 */

import type {
  InstrumentMatch,
  DiscoveryResult,
  Platform,
  Liquidity,
} from "../types";

// ============================================================================
// HYPERLIQUID DISCOVERY
// ============================================================================

interface HyperliquidAsset {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
}

interface HyperliquidMeta {
  universe: HyperliquidAsset[];
}

let hyperliquidCache: HyperliquidAsset[] | null = null;

async function fetchHyperliquidUniverse(): Promise<HyperliquidAsset[]> {
  if (hyperliquidCache) return hyperliquidCache;

  try {
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "meta" }),
    });

    if (!response.ok) return [];

    const data: HyperliquidMeta = await response.json();
    hyperliquidCache = data.universe || [];
    return hyperliquidCache;
  } catch (e) {
    console.error("Hyperliquid fetch failed:", e);
    return [];
  }
}

async function searchHyperliquid(query: string): Promise<InstrumentMatch[]> {
  const universe = await fetchHyperliquidUniverse();
  const queryLower = query.toLowerCase();
  const matches: InstrumentMatch[] = [];

  // Crypto ticker aliases
  const aliases: Record<string, string[]> = {
    bitcoin: ["BTC"],
    ethereum: ["ETH"],
    solana: ["SOL"],
    gold: ["XAU", "GLD"],
    silver: ["XAG", "SLV"],
    oil: ["WTI", "CL"],
    spy: ["SPY", "ES"],
    nasdaq: ["NQ", "QQQ"],
  };

  // Check aliases
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
        // Determine relevance
        let relevance: "direct" | "proxy" | "lateral" = "lateral";
        if (assetLower === q || asset.name === query.toUpperCase()) {
          relevance = "direct";
        } else if (q === queryLower) {
          relevance = "proxy";
        }

        // Estimate liquidity based on leverage
        let liquidity: Liquidity = "medium";
        if (asset.maxLeverage >= 50) liquidity = "high";
        else if (asset.maxLeverage <= 10) liquidity = "low";

        matches.push({
          ticker: asset.name,
          name: `${asset.name} Perpetual`,
          platform: "hyperliquid",
          instrument_type: "perp",
          relevance,
          explanation: `${asset.name} perpetual futures on Hyperliquid, up to ${asset.maxLeverage}x leverage`,
          liquidity,
        });
        break;
      }
    }
  }

  return matches;
}

// ============================================================================
// POLYMARKET DISCOVERY
// ============================================================================

interface PolymarketMarket {
  question: string;
  conditionId: string;
  slug: string;
  endDate: string;
  liquidity: string;
  volume: string;
  outcomePrices: string;
  outcomes: string;
  active: boolean;
}

async function searchPolymarket(query: string): Promise<InstrumentMatch[]> {
  try {
    // Use Polymarket's public markets endpoint
    // Filter: active=true, closed=false, sort by volume descending
    const response = await fetch(
      `https://gamma-api.polymarket.com/markets?_limit=30&active=true&closed=false&_sort=volume:desc&_q=${encodeURIComponent(query)}`
    );

    if (!response.ok) return [];

    const markets: PolymarketMarket[] = await response.json();
    const matches: InstrumentMatch[] = [];
    const now = new Date();

    for (const market of markets) {
      // Skip inactive or closed markets
      if (!market.active) continue;

      // Skip markets with past end dates
      const endDate = new Date(market.endDate);
      if (endDate < now) continue;

      const volume = parseFloat(market.volume) || 0;
      const liquidity: Liquidity =
        volume > 100000 ? "high" : volume > 10000 ? "medium" : "low";

      // Determine relevance based on query match quality
      const questionLower = market.question.toLowerCase();
      const queryLower = query.toLowerCase();
      let relevance: "direct" | "proxy" | "lateral" = "lateral";

      if (questionLower.includes(queryLower)) {
        relevance = "direct";
      } else {
        // Check for keyword overlap
        const keywords = queryLower.split(/\s+/);
        const matchCount = keywords.filter((k) => questionLower.includes(k)).length;
        if (matchCount > 0) {
          relevance = matchCount >= 2 ? "direct" : "proxy";
        }
      }

      matches.push({
        ticker: market.conditionId,
        name: market.question.slice(0, 100),
        platform: "polymarket",
        instrument_type: "prediction",
        relevance,
        explanation: `Prediction market: ${market.question} - Volume: $${(volume / 1000).toFixed(0)}K`,
        liquidity,
        resolution_date: market.endDate,
      });
    }

    // Limit to top 10 by volume
    return matches.slice(0, 10);
  } catch (e) {
    console.error("Polymarket search failed:", e);
    return [];
  }
}

// ============================================================================
// OKX ONCHAIN OS DISCOVERY
// ============================================================================

interface OkxToken {
  symbol: string;
  name: string;
  chainId: string;
  address: string;
  decimals: number;
  logoURI?: string;
}

async function searchOkx(query: string): Promise<InstrumentMatch[]> {
  // OKX OnchainOS primarily provides DEX aggregation
  // For now, we'll search common tokens
  const commonTokens: OkxToken[] = [
    { symbol: "ETH", name: "Ethereum", chainId: "1", address: "0x", decimals: 18 },
    { symbol: "WBTC", name: "Wrapped Bitcoin", chainId: "1", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
    { symbol: "SOL", name: "Solana", chainId: "501", address: "So1", decimals: 9 },
    { symbol: "USDC", name: "USD Coin", chainId: "1", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    { symbol: "USDT", name: "Tether", chainId: "1", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    { symbol: "ARB", name: "Arbitrum", chainId: "42161", address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18 },
    { symbol: "OP", name: "Optimism", chainId: "10", address: "0x4200000000000000000000000000000000000042", decimals: 18 },
  ];

  const queryLower = query.toLowerCase();
  const matches: InstrumentMatch[] = [];

  for (const token of commonTokens) {
    if (
      token.symbol.toLowerCase().includes(queryLower) ||
      token.name.toLowerCase().includes(queryLower)
    ) {
      matches.push({
        ticker: token.symbol,
        name: token.name,
        platform: "okx",
        instrument_type: "spot",
        relevance: token.symbol.toLowerCase() === queryLower ? "direct" : "proxy",
        explanation: `${token.name} (${token.symbol}) tradeable via OKX OnchainOS DEX aggregation`,
        liquidity: ["ETH", "WBTC", "USDC", "USDT"].includes(token.symbol) ? "high" : "medium",
      });
    }
  }

  return matches;
}

// ============================================================================
// MAIN DISCOVERY
// ============================================================================

export async function discover(
  query: string,
  platforms?: Platform[]
): Promise<DiscoveryResult> {
  const targetPlatforms = platforms || ["hyperliquid", "polymarket", "okx"];
  const allMatches: InstrumentMatch[] = [];

  const searches = [];

  if (targetPlatforms.includes("hyperliquid")) {
    searches.push(searchHyperliquid(query));
  }
  if (targetPlatforms.includes("polymarket")) {
    searches.push(searchPolymarket(query));
  }
  if (targetPlatforms.includes("okx")) {
    searches.push(searchOkx(query));
  }

  const results = await Promise.all(searches);
  for (const matches of results) {
    allMatches.push(...matches);
  }

  // Sort by relevance: direct > proxy > lateral
  const relevanceOrder = { direct: 0, proxy: 1, lateral: 2 };
  allMatches.sort(
    (a, b) => relevanceOrder[a.relevance] - relevanceOrder[b.relevance]
  );

  return {
    query,
    matches: allMatches,
    platforms_searched: targetPlatforms,
  };
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

function parseArgs(): { query: string; platforms?: Platform[] } {
  const args = process.argv.slice(2);
  let query = "";
  let platforms: Platform[] | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--platforms" && args[i + 1]) {
      platforms = args[i + 1].split(",") as Platform[];
      i++;
    } else if (!args[i].startsWith("--")) {
      query = args[i];
    }
  }

  return { query, platforms };
}

async function main() {
  const { query, platforms } = parseArgs();

  if (!query) {
    console.error("Usage: bun run discover.ts <query> [--platforms hyperliquid,polymarket,okx]");
    process.exit(1);
  }

  const result = await discover(query, platforms);
  console.log(JSON.stringify(result, null, 2));
}

// Only run CLI if this is the main module
if (import.meta.main) {
  main();
}

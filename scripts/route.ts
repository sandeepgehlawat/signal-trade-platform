#!/usr/bin/env bun
/**
 * Signal Trade - Route Engine
 *
 * Maps extracted theses to tradeable instruments:
 * 1. Parse thesis direction and subject
 * 2. Search venues for matching instruments
 * 3. Evaluate candidates (direct vs proxy vs lateral)
 * 4. Lock author price at publication date
 * 5. Generate derivation chain
 */

import type {
  Thesis,
  RouteEvidence,
  Direction,
  Derivation,
  InstrumentMatch,
  Platform,
} from "../types";
import { discover } from "./discover";

// ============================================================================
// PRICE FETCHING
// ============================================================================

async function fetchHyperliquidPrice(ticker: string): Promise<number | null> {
  try {
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "allMids",
      }),
    });

    if (!response.ok) return null;

    const data: Record<string, string> = await response.json();
    const price = data[ticker];
    return price ? parseFloat(price) : null;
  } catch (e) {
    console.error("[fetchHyperliquidPrice] Error:", e);
    return null;
  }
}

async function fetchPolymarketPrice(conditionId: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://gamma-api.polymarket.com/markets?conditionId=${conditionId}`
    );

    if (!response.ok) return null;

    const markets = await response.json();
    if (markets.length === 0) return null;

    // Parse outcome prices (format: "[0.65, 0.35]")
    const pricesStr = markets[0].outcomePrices;
    const prices = JSON.parse(pricesStr);
    return prices[0]; // YES price
  } catch (e) {
    console.error("[fetchPolymarketPrice] Error:", e);
    return null;
  }
}

async function fetchCurrentPrice(
  ticker: string,
  platform: Platform
): Promise<number | null> {
  switch (platform) {
    case "hyperliquid":
      return fetchHyperliquidPrice(ticker);
    case "polymarket":
      return fetchPolymarketPrice(ticker);
    case "okx":
      try {
        const { getCurrentPrice } = await import("../adapters/okx");
        return getCurrentPrice(ticker);
      } catch (e) {
        console.error("[fetchCurrentPrice] OKX error:", e);
        return null;
      }
    default:
      return null;
  }
}

// ============================================================================
// DIRECTION MAPPING
// ============================================================================

function mapDirection(
  thesisDirection: "bullish" | "bearish" | "neutral",
  platform: Platform
): Direction {
  if (platform === "polymarket") {
    return thesisDirection === "bullish" ? "yes" : "no";
  }
  return thesisDirection === "bullish" ? "long" : "short";
}

// ============================================================================
// CANDIDATE EVALUATION
// ============================================================================

interface EvaluatedCandidate {
  match: InstrumentMatch;
  score: number;
  pros: string[];
  cons: string[];
}

function evaluateCandidate(match: InstrumentMatch, keywords?: string[]): EvaluatedCandidate {
  const pros: string[] = [];
  const cons: string[] = [];
  let score = 0;

  // Check if this is a crypto asset trade (BTC, ETH, SOL, etc.)
  const cryptoAssets = ["BTC", "ETH", "SOL", "ARB", "OP", "AVAX", "MATIC", "LINK", "UNI", "AAVE"];
  const isCryptoTrade = keywords?.some((k) =>
    cryptoAssets.includes(k.toUpperCase())
  );

  // Relevance scoring
  if (match.relevance === "direct") {
    score += 100;
    pros.push("Direct exposure to thesis subject");
  } else if (match.relevance === "proxy") {
    score += 50;
    pros.push("Proxy exposure via related instrument");
    cons.push("Not direct exposure");
  } else {
    score += 10;
    cons.push("Lateral connection only");
  }

  // Liquidity scoring
  if (match.liquidity === "high") {
    score += 30;
    pros.push("High liquidity for easy entry/exit");
  } else if (match.liquidity === "medium") {
    score += 15;
  } else {
    score -= 10;
    cons.push("Low liquidity may impact execution");
  }

  // Platform preference - prefer perps for crypto, prediction markets for events
  if (match.platform === "hyperliquid") {
    // Strong preference for Hyperliquid on crypto trades
    score += isCryptoTrade ? 50 : 10;
    pros.push("Leveraged exposure available");
    if (isCryptoTrade && match.instrument_type === "perp") {
      pros.push("Direct price exposure via perpetual");
    }
  } else if (match.platform === "polymarket") {
    // Polymarket better for event-driven theses, not pure price exposure
    score += isCryptoTrade ? -20 : 25;
    pros.push("Binary outcome with defined resolution");
    if (isCryptoTrade) {
      cons.push("Indirect exposure via prediction market");
    }
  } else if (match.platform === "okx") {
    score += 15;
    pros.push("Spot exposure via DEX aggregation");
  }

  return { match, score, pros, cons };
}

function selectBestCandidate(
  candidates: EvaluatedCandidate[]
): EvaluatedCandidate | null {
  if (candidates.length === 0) return null;

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// ============================================================================
// DERIVATION BUILDER
// ============================================================================

function buildDerivation(
  thesis: Thesis,
  selected: InstrumentMatch,
  alternatives: InstrumentMatch[]
): Derivation {
  // Extract headline quote (max 120 chars)
  const headlineQuote =
    thesis.supporting_quotes[0]?.text.slice(0, 120) ||
    thesis.thesis_text.slice(0, 120);

  // Build derivation steps
  const steps = [
    {
      step_number: 1,
      text: `Thesis: ${thesis.direction} on ${thesis.keywords?.[0] || "market"}`,
    },
    {
      step_number: 2,
      text: `Found ${selected.ticker} as ${selected.relevance} match`,
    },
    {
      step_number: 3,
      text: selected.explanation.slice(0, 70),
    },
  ];

  // Build candidate comparison
  const candidateComparison = [selected, ...alternatives.slice(0, 3)].map(
    (match, idx) => {
      const evaluated = evaluateCandidate(match);
      return {
        ticker: match.ticker,
        platform: match.platform,
        pros: evaluated.pros,
        cons: evaluated.cons,
        selected: idx === 0,
      };
    }
  );

  return {
    headline_quote: headlineQuote,
    explanation: `Selected ${selected.ticker} on ${selected.platform} as ${selected.relevance} expression of thesis.`,
    steps,
    candidate_comparison: candidateComparison,
  };
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

export async function route(thesis: Thesis): Promise<RouteEvidence | null> {
  // Extract search keywords from thesis
  const searchTerms = [
    ...(thesis.keywords || []),
    ...thesis.thesis_text.split(/\s+/).slice(0, 5),
  ].filter((t) => t.length > 2);

  if (searchTerms.length === 0) {
    console.error("No searchable terms in thesis");
    return null;
  }

  // Search for instruments
  const discoveryResults = await Promise.all(
    searchTerms.slice(0, 3).map((term) => discover(term))
  );

  // Flatten and dedupe matches
  const allMatches: InstrumentMatch[] = [];
  const seen = new Set<string>();

  for (const result of discoveryResults) {
    for (const match of result.matches) {
      const key = `${match.platform}:${match.ticker}`;
      if (!seen.has(key)) {
        seen.add(key);
        allMatches.push(match);
      }
    }
  }

  if (allMatches.length === 0) {
    console.error("No instruments found for thesis");
    return null;
  }

  // Evaluate candidates (pass thesis keywords for context-aware scoring)
  const evaluated = allMatches.map((m) => evaluateCandidate(m, thesis.keywords));
  const selected = selectBestCandidate(evaluated);

  if (!selected) {
    return null;
  }

  // Fetch current price
  const currentPrice = await fetchCurrentPrice(
    selected.match.ticker,
    selected.match.platform
  );

  // Build derivation
  const alternatives = allMatches.filter(
    (m) => m.ticker !== selected.match.ticker
  );
  const derivation = buildDerivation(thesis, selected.match, alternatives);

  // Determine direction
  const direction = mapDirection(thesis.direction, selected.match.platform);

  // Determine trade type
  const tradeType =
    selected.match.relevance === "direct" ? "direct" : "derived";

  return {
    thesis_id: thesis.id,
    routed_ticker: selected.match.ticker,
    platform: selected.match.platform,
    instrument_type: selected.match.instrument_type,
    direction,
    trade_type: tradeType,
    posted_price: currentPrice || undefined,
    price_timestamp: new Date().toISOString(),
    selection_reason: `${selected.match.relevance} match via ${selected.match.platform}`,
    alternatives,
    derivation,
  };
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: bun run route.ts '<thesis JSON>'");
    process.exit(1);
  }

  try {
    const thesis: Thesis = JSON.parse(args[0]);
    const result = await route(thesis);

    if (result) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error("Failed to route thesis");
      process.exit(1);
    }
  } catch (e) {
    console.error("Invalid thesis JSON:", e);
    process.exit(1);
  }
}

// Only run CLI if this is the main module
if (import.meta.main) {
  main();
}

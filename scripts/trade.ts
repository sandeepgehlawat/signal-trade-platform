#!/usr/bin/env bun
/**
 * Signal Trade - Main CLI Entry Point
 *
 * Usage:
 *   bun run trade.ts <url-or-text>        Extract signals and route to instruments
 *   bun run trade.ts update               Update status of tracked trades
 *   bun run trade.ts --help               Show help
 *
 * The full pipeline:
 * 1. Extract content from source (YouTube, Twitter, article, etc.)
 * 2. Identify trading theses with quote attribution
 * 3. Research and discover matching instruments
 * 4. Route theses to best instruments with derivation
 * 5. Post trades with locked pricing
 */

import type {
  ExtractedSource,
  Thesis,
  RouteEvidence,
  TradePost,
  Platform,
} from "../types";
import { extract } from "./extract";
import { route } from "./route";
import { getAllTrades, updateTradePrice, getTradeRow } from "../shared/storage";
import { computeAuthorPnl, computePostedPnl, formatPnlPct } from "../shared/pnl";
import { extractTheses } from "../shared/thesis";

// ============================================================================
// TRADE POSTING
// ============================================================================

function createTradePost(
  thesis: Thesis,
  routeEvidence: RouteEvidence,
  source: ExtractedSource
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
    author_price: routeEvidence.author_price || 0,
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
// MAIN PIPELINE
// ============================================================================

async function runPipeline(input: string): Promise<void> {
  console.log("\n=== Signal Trade ===\n");

  // Step 1: Extract content
  console.log("Step 1: Extracting content...");
  const extractResult = await extract(input);

  if (!extractResult.success || !extractResult.source) {
    console.error("Extraction failed:", extractResult.error);
    process.exit(1);
  }

  const source = extractResult.source;
  console.log(`  Source type: ${source.source_type}`);
  console.log(`  Title: ${source.title || "N/A"}`);
  console.log(`  Author: ${source.author || "Unknown"}`);
  console.log(`  Words: ${source.word_count}`);
  console.log("");

  // Step 2: Extract theses (using shared module)
  console.log("Step 2: Identifying trading theses...");
  const theses = extractTheses(source);

  if (theses.length === 0) {
    console.log("  No tradeable theses identified in source.");
    console.log("  The content may not contain clear trading signals.\n");
    return;
  }

  console.log(`  Found ${theses.length} thesis(es):`);
  for (const thesis of theses) {
    console.log(`    - ${thesis.thesis_text} (${thesis.direction}, ${(thesis.confidence * 100).toFixed(0)}% confidence)`);
  }
  console.log("");

  // Step 3 & 4: Route each thesis
  console.log("Step 3: Routing theses to instruments...\n");
  const tradePosts: TradePost[] = [];

  for (const thesis of theses) {
    console.log(`  Routing: ${thesis.thesis_text}`);

    const routeEvidence = await route(thesis);

    if (!routeEvidence) {
      console.log(`    No suitable instrument found.\n`);
      continue;
    }

    console.log(`    Routed to: ${routeEvidence.routed_ticker} on ${routeEvidence.platform}`);
    console.log(`    Direction: ${routeEvidence.direction}`);
    console.log(`    Trade type: ${routeEvidence.trade_type}`);
    if (routeEvidence.posted_price && typeof routeEvidence.posted_price === 'number') {
      console.log(`    Current price: $${routeEvidence.posted_price.toFixed(4)}`);
    }
    console.log("");

    // Create trade post
    const post = createTradePost(thesis, routeEvidence, source);
    tradePosts.push(post);
  }

  // Step 5: Output results
  console.log("=== Results ===\n");

  if (tradePosts.length === 0) {
    console.log("No trades could be routed from this source.\n");
    return;
  }

  for (const post of tradePosts) {
    console.log(`Trade: ${post.ticker}`);
    console.log(`  Platform: ${post.platform}`);
    console.log(`  Direction: ${post.direction}`);
    console.log(`  Type: ${post.trade_type}`);
    console.log(`  Quote: "${post.headline_quote}"`);
    console.log("");
    console.log("  Derivation:");
    for (const step of post.derivation.steps) {
      console.log(`    ${step.step_number}. ${step.text}`);
    }
    console.log("");
  }

  // Output JSON for programmatic use
  console.log("=== JSON Output ===");
  console.log(JSON.stringify(tradePosts, null, 2));
}

// ============================================================================
// PRICE FETCHING FOR UPDATE
// ============================================================================

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
      } catch {
        return null;
      }
    default:
      return null;
  }
}

async function fetchHyperliquidPrice(ticker: string): Promise<number | null> {
  try {
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "allMids" }),
    });

    if (!response.ok) return null;

    const data: Record<string, string> = await response.json();
    const price = data[ticker];
    return price ? parseFloat(price) : null;
  } catch (e) {
    console.error("[update] Hyperliquid price fetch error:", e);
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

    const pricesStr = markets[0].outcomePrices;
    const prices = JSON.parse(pricesStr);
    return prices[0];
  } catch (e) {
    console.error("[update] Polymarket price fetch error:", e);
    return null;
  }
}

// ============================================================================
// UPDATE ALL TRADES
// ============================================================================

async function updateAllTrades(): Promise<void> {
  console.log("\n=== Updating Trades ===\n");

  const trades = getAllTrades("open");

  if (trades.length === 0) {
    console.log("No open trades to update.");
    return;
  }

  console.log(`Found ${trades.length} open trade(s). Fetching prices...\n`);

  let updated = 0;
  let failed = 0;

  for (const trade of trades) {
    const row = getTradeRow(trade.trade_id);
    if (!row) continue;

    const price = await fetchCurrentPrice(trade.ticker, trade.platform);

    if (price === null) {
      console.log(`  ${trade.ticker}: Failed to fetch price`);
      failed++;
      continue;
    }

    // Calculate P&L
    const authorPnl = computeAuthorPnl(
      row.author_price,
      price,
      trade.direction,
      trade.platform
    );
    const postedPnl = computePostedPnl(
      row.posted_price,
      price,
      trade.direction,
      trade.platform
    );

    // Update database
    updateTradePrice(trade.trade_id, price, authorPnl, postedPnl);
    updated++;

    // Display
    const pnlStr = postedPnl !== null ? formatPnlPct(postedPnl) : "--";
    const priceStr = price.toFixed(4);
    console.log(`  ${trade.ticker.padEnd(15)} $${priceStr.padEnd(12)} P&L: ${pnlStr}`);
  }

  console.log("");
  console.log(`Updated: ${updated} trade(s)`);
  if (failed > 0) {
    console.log(`Failed:  ${failed} trade(s)`);
  }
  console.log("");
}

// ============================================================================
// CLI
// ============================================================================

function showHelp(): void {
  console.log(`
Signal Trade - Extract trading signals from any content

USAGE:
  bun run trade.ts <url-or-text>    Extract signals from URL or text
  bun run trade.ts update           Update tracked trade status
  bun run trade.ts --help           Show this help

EXAMPLES:
  # Extract from Twitter
  bun run trade.ts "https://x.com/someuser/status/123456"

  # Extract from YouTube
  bun run trade.ts "https://youtube.com/watch?v=abc123"

  # Extract from article
  bun run trade.ts "https://example.com/crypto-analysis"

  # Direct text input
  bun run trade.ts "I'm bullish on ETH, expecting $5000 by Q2"

SUPPORTED SOURCES:
  - YouTube videos (requires yt-dlp)
  - Twitter/X posts
  - Articles and blog posts
  - Direct text input

SUPPORTED VENUES:
  - Hyperliquid (perpetual futures)
  - Polymarket (prediction markets)
  - OKX OnchainOS (spot via DEX aggregation)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  if (args[0] === "update") {
    await updateAllTrades();
    process.exit(0);
  }

  const input = args.join(" ");
  await runPipeline(input);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

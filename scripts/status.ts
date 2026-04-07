#!/usr/bin/env bun
/**
 * Signal Trade - Status Script
 *
 * Show trade status and P&L
 *
 * Usage:
 *   bun run status.ts                  Show all open trades summary
 *   bun run status.ts <trade_id>       Show single trade details
 *   bun run status.ts --all            Show all trades (including closed)
 */

import {
  getTrade,
  getAllTrades,
  getTradeRow,
  getTradeStats,
  updateTradePrice,
} from "../shared/storage";
import {
  computeAuthorPnl,
  computePostedPnl,
  formatPnlPct,
} from "../shared/pnl";
import { formatPrice } from "../shared/pricing";
import type { TrackedTrade } from "../types";

// Import price fetchers from route.ts
async function fetchCurrentPrice(
  ticker: string,
  platform: string
): Promise<number | null> {
  switch (platform) {
    case "hyperliquid":
      return fetchHyperliquidPrice(ticker);
    case "polymarket":
      return fetchPolymarketPrice(ticker);
    case "okx":
      return fetchOkxPrice(ticker);
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
    console.error("[status] Hyperliquid price fetch error:", e);
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
    console.error("[status] Polymarket price fetch error:", e);
    return null;
  }
}

async function fetchOkxPrice(ticker: string): Promise<number | null> {
  try {
    const { getCurrentPrice } = await import("../adapters/okx");
    return getCurrentPrice(ticker);
  } catch (e) {
    console.error("[status] OKX price fetch error:", e);
    return null;
  }
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

function colorPnl(pnl: number | null | undefined): string {
  if (pnl === null || pnl === undefined) return "--";
  const formatted = formatPnlPct(pnl);
  // Terminal colors: green for positive, red for negative
  if (pnl > 0) return `\x1b[32m${formatted}\x1b[0m`;
  if (pnl < 0) return `\x1b[31m${formatted}\x1b[0m`;
  return formatted;
}

function directionArrow(direction: string): string {
  switch (direction) {
    case "long":
    case "yes":
      return "\x1b[32m\u2191\x1b[0m"; // Green up arrow
    case "short":
    case "no":
      return "\x1b[31m\u2193\x1b[0m"; // Red down arrow
    default:
      return "-";
  }
}

function formatTicker(ticker: string, maxLen = 20): string {
  if (ticker.length <= maxLen) return ticker.padEnd(maxLen);
  return ticker.slice(0, maxLen - 3) + "...";
}

// ============================================================================
// SINGLE TRADE VIEW
// ============================================================================

async function showSingleTrade(tradeId: string): Promise<void> {
  const trade = getTrade(tradeId);
  const row = getTradeRow(tradeId);

  if (!trade || !row) {
    console.error(`Trade not found: ${tradeId}`);
    process.exit(1);
  }

  // Fetch current price
  console.log(`Fetching current price for ${trade.ticker}...`);
  const currentPrice = await fetchCurrentPrice(trade.ticker, trade.platform);

  // Calculate P&L
  let authorPnl: number | null = null;
  let postedPnl: number | null = null;

  if (currentPrice !== null) {
    authorPnl = computeAuthorPnl(
      row.author_price,
      currentPrice,
      trade.direction,
      trade.platform
    );
    postedPnl = computePostedPnl(
      row.posted_price,
      currentPrice,
      trade.direction,
      trade.platform
    );

    // Update database
    updateTradePrice(tradeId, currentPrice, authorPnl, postedPnl);
  }

  // Display
  console.log("");
  console.log("=".repeat(60));
  console.log(`Trade: ${trade.trade_id}`);
  console.log("=".repeat(60));
  console.log("");
  console.log(`  Ticker:       ${trade.ticker}`);
  console.log(`  Platform:     ${trade.platform}`);
  console.log(`  Direction:    ${trade.direction} ${directionArrow(trade.direction)}`);
  console.log(`  Status:       ${trade.status}`);
  console.log("");
  console.log("  Pricing:");
  console.log(`    Author:     $${formatPrice(row.author_price)}`);
  console.log(`    Posted:     $${formatPrice(row.posted_price)}`);
  console.log(`    Current:    $${formatPrice(currentPrice)}`);
  console.log("");
  console.log("  P&L:");
  console.log(`    Author:     ${colorPnl(authorPnl)}`);
  console.log(`    Posted:     ${colorPnl(postedPnl)}`);
  console.log("");
  console.log("  Timeline:");
  console.log(`    Opened:     ${trade.opened_at}`);
  console.log(`    Updated:    ${row.updated_at}`);
  if (row.headline_quote) {
    console.log("");
    console.log(`  Quote: "${row.headline_quote}"`);
  }
  console.log("");
}

// ============================================================================
// ALL TRADES VIEW
// ============================================================================

async function showAllTrades(includeClosedArg: boolean): Promise<void> {
  const stats = getTradeStats();
  const trades = includeClosedArg ? getAllTrades() : getAllTrades("open");

  if (trades.length === 0) {
    console.log("No trades found.");
    console.log("");
    console.log("To create a trade:");
    console.log('  bun run trade "I\'m bullish on ETH" | bun run post.ts');
    return;
  }

  // Fetch prices for all open trades
  const priceUpdates: Array<{
    trade: TrackedTrade;
    currentPrice: number | null;
    authorPnl: number | null;
    postedPnl: number | null;
  }> = [];

  console.log("Fetching current prices...\n");

  for (const trade of trades) {
    if (trade.status === "open") {
      const currentPrice = await fetchCurrentPrice(trade.ticker, trade.platform);
      const row = getTradeRow(trade.trade_id);

      let authorPnl: number | null = null;
      let postedPnl: number | null = null;

      if (currentPrice !== null && row) {
        authorPnl = computeAuthorPnl(
          row.author_price,
          currentPrice,
          trade.direction,
          trade.platform
        );
        postedPnl = computePostedPnl(
          row.posted_price,
          currentPrice,
          trade.direction,
          trade.platform
        );

        // Update database
        updateTradePrice(trade.trade_id, currentPrice, authorPnl, postedPnl);
      }

      priceUpdates.push({ trade, currentPrice, authorPnl, postedPnl });
    } else {
      priceUpdates.push({
        trade,
        currentPrice: trade.current_price || null,
        authorPnl: trade.author_pnl || null,
        postedPnl: trade.posted_pnl || null,
      });
    }
  }

  // Display stats
  console.log("=".repeat(80));
  console.log(
    `Trades: ${stats.total} total | ${stats.open} open | ${stats.closed} closed | ${stats.expired} expired`
  );
  console.log("=".repeat(80));
  console.log("");

  // Table header
  const header = [
    "Dir".padEnd(4),
    "Ticker".padEnd(20),
    "Platform".padEnd(12),
    "Entry".padEnd(10),
    "Current".padEnd(10),
    "P&L".padEnd(12),
    "Status".padEnd(8),
  ].join(" | ");

  console.log(header);
  console.log("-".repeat(header.length));

  // Table rows
  for (const { trade, currentPrice, postedPnl } of priceUpdates) {
    const row = getTradeRow(trade.trade_id);
    const entryPrice = row?.posted_price || row?.author_price || 0;

    const line = [
      directionArrow(trade.direction).padEnd(4),
      formatTicker(trade.ticker, 20),
      trade.platform.padEnd(12),
      `$${formatPrice(entryPrice, { decimals: 4 })}`.padEnd(10),
      currentPrice !== null ? `$${formatPrice(currentPrice, { decimals: 4 })}`.padEnd(10) : "--".padEnd(10),
      colorPnl(postedPnl).padEnd(12),
      trade.status.padEnd(8),
    ].join(" | ");

    console.log(line);
  }

  console.log("");

  // Summary P&L
  const openTrades = priceUpdates.filter((p) => p.trade.status === "open");
  const totalPostedPnl = openTrades.reduce(
    (sum, p) => sum + (p.postedPnl || 0),
    0
  );

  if (openTrades.length > 0) {
    console.log(`Total Open P&L: ${colorPnl(totalPostedPnl / openTrades.length)} (avg)`);
  }

  console.log("");
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Signal Trade - Status

Usage:
  bun run status.ts                  Show all open trades
  bun run status.ts <trade_id>       Show single trade details
  bun run status.ts --all            Show all trades (including closed)

Options:
  --all, -a     Include closed and expired trades
  --help, -h    Show this help message
`);
    return;
  }

  const includeClosed = args.includes("--all") || args.includes("-a");
  const tradeId = args.find((a) => !a.startsWith("-"));

  if (tradeId) {
    await showSingleTrade(tradeId);
  } else {
    await showAllTrades(includeClosed);
  }
}

main().catch((e) => {
  console.error("[status] Fatal error:", e);
  process.exit(1);
});

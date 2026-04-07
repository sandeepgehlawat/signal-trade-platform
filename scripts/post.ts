#!/usr/bin/env bun
/**
 * Signal Trade - Post Script
 *
 * Save trades to the database
 *
 * Usage:
 *   bun run trade "..." | bun run post.ts         Pipe trade JSON from trade.ts
 *   bun run post.ts '{"id": "...", ...}'          Pass trade JSON as argument
 *   echo '{"id": "...", ...}' | bun run post.ts   Pipe from stdin
 */

import type { TradePost } from "../types";
import { saveTrade, getTrade } from "../shared/storage";

// ============================================================================
// VALIDATION
// ============================================================================

function validateTradePost(data: unknown): data is TradePost {
  if (!data || typeof data !== "object") {
    return false;
  }

  const trade = data as Record<string, unknown>;

  // Required fields
  const requiredFields = [
    "id",
    "ticker",
    "direction",
    "platform",
  ];

  for (const field of requiredFields) {
    if (!trade[field]) {
      console.error(`[post] Missing required field: ${field}`);
      return false;
    }
  }

  // Validate direction
  const validDirections = ["long", "short", "yes", "no"];
  if (!validDirections.includes(trade.direction as string)) {
    console.error(`[post] Invalid direction: ${trade.direction}`);
    return false;
  }

  // Validate platform
  const validPlatforms = ["hyperliquid", "polymarket", "okx"];
  if (!validPlatforms.includes(trade.platform as string)) {
    console.error(`[post] Invalid platform: ${trade.platform}`);
    return false;
  }

  return true;
}

// ============================================================================
// STDIN READER
// ============================================================================

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  const reader = Bun.stdin.stream().getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let input: string;

  // Get input from args or stdin
  if (args.length > 0) {
    input = args.join(" ");
  } else {
    // Check if stdin has data
    input = await readStdin();
  }

  if (!input.trim()) {
    console.error("Usage: bun run post.ts '<trade JSON>'");
    console.error("   or: bun run trade '...' | bun run post.ts");
    process.exit(1);
  }

  // Parse input - could be single trade or array of trades
  let trades: TradePost[];

  try {
    const parsed = JSON.parse(input);

    // Handle array from trade.ts output (JSON Output section)
    if (Array.isArray(parsed)) {
      trades = parsed;
    } else {
      trades = [parsed];
    }
  } catch (e) {
    console.error("[post] Invalid JSON input:", e);
    process.exit(1);
  }

  // Validate and save each trade
  const saved: string[] = [];
  const failed: string[] = [];

  for (const trade of trades) {
    if (!validateTradePost(trade)) {
      failed.push(trade.ticker || "unknown");
      continue;
    }

    // Check if trade already exists
    const existing = getTrade(trade.id);
    if (existing) {
      console.log(`[post] Trade ${trade.id} already exists, skipping`);
      continue;
    }

    try {
      const id = saveTrade(trade);
      saved.push(id);
      console.log(`[post] Saved trade: ${id} (${trade.ticker} on ${trade.platform})`);
    } catch (e) {
      console.error(`[post] Failed to save trade ${trade.id}:`, e);
      failed.push(trade.id);
    }
  }

  // Summary
  console.log("");
  console.log(`Saved: ${saved.length} trade(s)`);
  if (failed.length > 0) {
    console.log(`Failed: ${failed.length} trade(s)`);
  }

  // Output saved trade IDs for chaining
  if (saved.length > 0) {
    console.log("");
    console.log("Trade IDs:");
    for (const id of saved) {
      console.log(`  ${id}`);
    }
  }
}

main().catch((e) => {
  console.error("[post] Fatal error:", e);
  process.exit(1);
});

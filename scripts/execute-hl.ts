#!/usr/bin/env bun
/**
 * Hyperliquid Execution CLI
 *
 * Usage:
 *   bun run scripts/execute-hl.ts --ticker BTC --direction long --size 0.01
 *   bun run scripts/execute-hl.ts --ticker ETH --direction short --size 0.1 --leverage 5
 */

import { execute, getBalance, getPosition } from "../adapters/hyperliquid/execute";
import type { Direction } from "../types";

// Parse CLI arguments
const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return args[index + 1];
}

function printUsage() {
  console.log(`
Hyperliquid Execution CLI

Usage:
  bun run scripts/execute-hl.ts --ticker <TICKER> --direction <long|short> --size <SIZE>

Options:
  --ticker      Asset ticker (BTC, ETH, SOL, etc.)
  --direction   Trade direction (long or short)
  --size        Position size in base asset
  --leverage    Leverage (default: 1)
  --price       Limit price (optional, uses market if not set)
  --balance     Show account balance
  --position    Show position for ticker

Examples:
  # Long 0.01 BTC
  bun run scripts/execute-hl.ts --ticker BTC --direction long --size 0.01

  # Short 1 ETH with 5x leverage
  bun run scripts/execute-hl.ts --ticker ETH --direction short --size 1 --leverage 5

  # Check balance
  bun run scripts/execute-hl.ts --balance

  # Check BTC position
  bun run scripts/execute-hl.ts --position --ticker BTC
`);
}

async function main() {
  // Handle special commands
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  if (args.includes("--balance")) {
    const balance = await getBalance();
    console.log(JSON.stringify({ balance, currency: "USD" }, null, 2));
    process.exit(0);
  }

  if (args.includes("--position")) {
    const ticker = getArg("ticker");
    if (!ticker) {
      console.error("Error: --ticker required for --position");
      process.exit(1);
    }
    const position = await getPosition(ticker);
    console.log(JSON.stringify(position || { position: null }, null, 2));
    process.exit(0);
  }

  // Parse trade arguments
  const ticker = getArg("ticker");
  const direction = getArg("direction") as Direction;
  const size = parseFloat(getArg("size") || "0");
  const leverage = parseInt(getArg("leverage") || "1");
  const price = getArg("price") ? parseFloat(getArg("price")!) : undefined;

  // Validate
  if (!ticker) {
    console.error("Error: --ticker required");
    printUsage();
    process.exit(1);
  }

  if (!direction || !["long", "short"].includes(direction)) {
    console.error("Error: --direction must be 'long' or 'short'");
    printUsage();
    process.exit(1);
  }

  if (!size || size <= 0) {
    console.error("Error: --size must be positive number");
    printUsage();
    process.exit(1);
  }

  // Execute
  console.log(`[execute-hl] ${direction.toUpperCase()} ${size} ${ticker} @ ${price || "market"}`);

  const result = await execute({
    ticker,
    direction,
    size,
    leverage,
    price,
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});

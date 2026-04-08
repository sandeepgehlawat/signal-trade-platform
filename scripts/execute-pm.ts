#!/usr/bin/env bun
/**
 * Polymarket Execution CLI
 *
 * Usage:
 *   bun run scripts/execute-pm.ts --market <CONDITION_ID> --direction yes --size 50
 */

import { execute, getBalance } from "../adapters/polymarket/execute";
import type { Direction } from "../types";

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return args[index + 1];
}

function printUsage() {
  console.log(`
Polymarket Execution CLI

Usage:
  bun run scripts/execute-pm.ts --market <CONDITION_ID> --direction <yes|no> --size <USD>

Options:
  --market      Market condition ID (0x...)
  --direction   Outcome direction (yes or no)
  --size        Size in USD
  --price       Limit price 0-1 (optional, uses market if not set)
  --balance     Show account balance

Examples:
  # Buy $50 of YES tokens
  bun run scripts/execute-pm.ts --market 0x123... --direction yes --size 50

  # Buy $100 of NO tokens at 0.30
  bun run scripts/execute-pm.ts --market 0x123... --direction no --size 100 --price 0.30

  # Check balance
  bun run scripts/execute-pm.ts --balance
`);
}

async function main() {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  if (args.includes("--balance")) {
    const balance = await getBalance();
    console.log(JSON.stringify({ balance, currency: "USDC" }, null, 2));
    process.exit(0);
  }

  const market = getArg("market");
  const direction = getArg("direction") as "yes" | "no";
  const size = parseFloat(getArg("size") || "0");
  const price = getArg("price") ? parseFloat(getArg("price")!) : undefined;

  if (!market) {
    console.error("Error: --market required");
    printUsage();
    process.exit(1);
  }

  if (!direction || !["yes", "no"].includes(direction)) {
    console.error("Error: --direction must be 'yes' or 'no'");
    printUsage();
    process.exit(1);
  }

  if (!size || size <= 0) {
    console.error("Error: --size must be positive number");
    printUsage();
    process.exit(1);
  }

  console.log(`[execute-pm] ${direction.toUpperCase()} $${size} on ${market.slice(0, 10)}...`);

  const result = await execute({
    conditionId: market,
    direction: direction as Direction,
    size,
    price,
    orderType: price ? "limit" : "market",
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});

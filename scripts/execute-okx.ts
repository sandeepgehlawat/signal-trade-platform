#!/usr/bin/env bun
/**
 * OKX OnchainOS Execution CLI
 *
 * Usage:
 *   bun run scripts/execute-okx.ts --from USDC --to ETH --amount 100 --chain polygon
 */

import { execute } from "../adapters/okx/execute";

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return args[index + 1];
}

function printUsage() {
  console.log(`
OKX OnchainOS Execution CLI (DEX Aggregator)

Usage:
  bun run scripts/execute-okx.ts --from <TOKEN> --to <TOKEN> --amount <USD> --chain <CHAIN>

Options:
  --from        Source token (USDC, ETH, etc.)
  --to          Destination token (ETH, BTC, etc.)
  --amount      Amount in USD (or source token units)
  --chain       Chain: ethereum, polygon, arbitrum, optimism, bsc, base

Examples:
  # Swap $100 USDC to ETH on Polygon
  bun run scripts/execute-okx.ts --from USDC --to ETH --amount 100 --chain polygon

  # Swap $500 USDC to BTC on Arbitrum
  bun run scripts/execute-okx.ts --from USDC --to WBTC --amount 500 --chain arbitrum
`);
}

async function main() {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const from = getArg("from");
  const to = getArg("to");
  const amount = parseFloat(getArg("amount") || "0");
  const chain = getArg("chain") || "polygon";

  if (!from || !to) {
    console.error("Error: --from and --to required");
    printUsage();
    process.exit(1);
  }

  if (!amount || amount <= 0) {
    console.error("Error: --amount must be positive number");
    printUsage();
    process.exit(1);
  }

  console.log(`[execute-okx] Swap $${amount} ${from} → ${to} on ${chain}`);

  // Map direction based on swap
  const direction = from.toUpperCase() === "USDC" ? "long" : "short";

  const result = await execute({
    ticker: to,
    direction,
    amountUsd: amount,
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});

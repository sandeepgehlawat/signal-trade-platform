/**
 * Signal Trade - Unified Execution Layer
 *
 * Routes trade execution to the appropriate platform:
 * - Hyperliquid: Perpetual futures
 * - Polymarket: Prediction markets
 * - OKX DEX: Spot swaps
 */

import type { Platform, Direction, TradePost } from "../types";
import * as hyperliquid from "../adapters/hyperliquid/execute";
import * as polymarket from "../adapters/polymarket/execute";
import * as okx from "../adapters/okx/execute";

// ============================================================================
// TYPES
// ============================================================================

export interface ExecutionResult {
  success: boolean;
  platform: Platform;
  orderId?: string | number;
  filledSize?: number;
  avgPrice?: number;
  txHash?: string;
  error?: string;
}

export interface ExecutionParams {
  platform: Platform;
  ticker: string;
  direction: Direction;
  size: number; // In USD for most cases
  price?: number;
  leverage?: number;
  conditionId?: string; // For Polymarket
}

// ============================================================================
// POSITION SIZING
// ============================================================================

function calculatePositionSize(): number {
  const riskCapital = parseFloat(process.env.RISK_CAPITAL || "10000");
  const maxPct = parseFloat(process.env.MAX_POSITION_PCT || "5") / 100;
  return riskCapital * maxPct;
}

// ============================================================================
// EXECUTION ROUTER
// ============================================================================

/**
 * Execute a trade on the appropriate platform
 */
export async function execute(params: ExecutionParams): Promise<ExecutionResult> {
  const isPaperMode = process.env.PAPER_MODE !== "false";

  console.log(
    `[execute] ${isPaperMode ? "PAPER" : "LIVE"} ${params.direction.toUpperCase()} ` +
      `${params.ticker} on ${params.platform} size=$${params.size}`
  );

  switch (params.platform) {
    case "hyperliquid":
      return executeHyperliquid(params);

    case "polymarket":
      return executePolymarket(params);

    case "okx":
      return executeOkx(params);

    default:
      return {
        success: false,
        platform: params.platform,
        error: `Unsupported platform: ${params.platform}`,
      };
  }
}

// ============================================================================
// PLATFORM-SPECIFIC EXECUTION
// ============================================================================

async function executeHyperliquid(params: ExecutionParams): Promise<ExecutionResult> {
  try {
    // Calculate size in base asset
    // For now, use a rough estimate - in production, fetch current price
    const prices: Record<string, number> = {
      BTC: 70000,
      ETH: 2100,
      SOL: 80,
    };

    const basePrice = prices[params.ticker.toUpperCase()] || 100;
    const sizeInBase = params.size / basePrice;

    const result = await hyperliquid.execute({
      ticker: params.ticker,
      direction: params.direction,
      size: parseFloat(sizeInBase.toFixed(4)),
      price: params.price,
      leverage: params.leverage || parseInt(process.env.DEFAULT_LEVERAGE || "1"),
    });

    return {
      success: result.success,
      platform: "hyperliquid",
      orderId: result.orderId,
      filledSize: result.filledSize ? parseFloat(result.filledSize) : undefined,
      avgPrice: result.avgPrice ? parseFloat(result.avgPrice) : undefined,
      error: result.error,
    };
  } catch (e) {
    return {
      success: false,
      platform: "hyperliquid",
      error: String(e),
    };
  }
}

async function executePolymarket(params: ExecutionParams): Promise<ExecutionResult> {
  try {
    if (!params.conditionId) {
      return {
        success: false,
        platform: "polymarket",
        error: "conditionId required for Polymarket trades",
      };
    }

    const result = await polymarket.execute({
      conditionId: params.conditionId,
      direction: params.direction,
      size: params.size,
      price: params.price,
      orderType: params.price ? "limit" : "market",
    });

    return {
      success: result.success,
      platform: "polymarket",
      orderId: result.orderId,
      filledSize: result.filledSize,
      avgPrice: result.avgPrice,
      error: result.error,
    };
  } catch (e) {
    return {
      success: false,
      platform: "polymarket",
      error: String(e),
    };
  }
}

async function executeOkx(params: ExecutionParams): Promise<ExecutionResult> {
  try {
    const result = await okx.execute({
      ticker: params.ticker,
      direction: params.direction,
      amountUsd: params.size,
    });

    return {
      success: result.success,
      platform: "okx",
      txHash: result.txHash,
      error: result.error,
    };
  } catch (e) {
    return {
      success: false,
      platform: "okx",
      error: String(e),
    };
  }
}

// ============================================================================
// TRADE POST EXECUTION
// ============================================================================

/**
 * Execute a trade from a TradePost object
 * This is the main entry point from the API/CLI
 */
export async function executeTradePost(trade: TradePost): Promise<ExecutionResult> {
  const positionSize = calculatePositionSize();

  return execute({
    platform: trade.platform,
    ticker: trade.ticker,
    direction: trade.direction,
    size: positionSize,
    conditionId: trade.platform === "polymarket" ? trade.ticker : undefined,
  });
}

// ============================================================================
// BALANCE & POSITION QUERIES
// ============================================================================

export async function getBalances(): Promise<Record<Platform, number>> {
  const balances: Record<Platform, number> = {
    hyperliquid: 0,
    polymarket: 0,
    okx: 0,
  };

  try {
    balances.hyperliquid = await hyperliquid.getBalance();
  } catch (e) {
    console.error("[execute] Failed to get HL balance:", e);
  }

  try {
    balances.polymarket = await polymarket.getBalance();
  } catch (e) {
    console.error("[execute] Failed to get PM balance:", e);
  }

  // OKX balance requires on-chain query - skip for now

  return balances;
}

export async function getHyperliquidPosition(ticker: string) {
  return hyperliquid.getPosition(ticker);
}

export async function closeHyperliquidPosition(
  ticker: string,
  size: number,
  direction: Direction
) {
  return hyperliquid.closePosition(ticker, size, direction);
}

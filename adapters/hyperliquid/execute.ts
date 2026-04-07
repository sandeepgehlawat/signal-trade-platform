/**
 * Hyperliquid Execution Layer
 *
 * Places real orders on Hyperliquid perpetual futures DEX
 * Uses @nktkas/hyperliquid SDK with EIP-712 signing
 */

import { ExchangeClient, InfoClient, HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import type { Direction } from "../../types";

// ============================================================================
// CONFIGURATION
// ============================================================================

const MAINNET_URL = "https://api.hyperliquid.xyz";
const TESTNET_URL = "https://api.hyperliquid-testnet.xyz";

const USE_TESTNET = process.env.HL_TESTNET === "true";
const BASE_URL = USE_TESTNET ? TESTNET_URL : MAINNET_URL;

// Default slippage for market orders (1%)
const DEFAULT_SLIPPAGE = 0.01;

// Minimum order value in USD
const MIN_ORDER_VALUE = 10;

// ============================================================================
// TYPES
// ============================================================================

export interface HLExecutionResult {
  success: boolean;
  orderId?: number;
  filledSize?: string;
  avgPrice?: string;
  error?: string;
}

export interface HLOrderParams {
  ticker: string;
  direction: Direction;
  size: number;
  price?: number; // If not provided, uses market order
  reduceOnly?: boolean;
  leverage?: number;
}

// Asset index mapping (perpetuals)
const ASSET_INDEX: Record<string, number> = {
  BTC: 0,
  ETH: 1,
  SOL: 5,
  AVAX: 8,
  ARB: 11,
  OP: 15,
  MATIC: 9,
  LINK: 6,
  DOGE: 12,
  // Add more as needed - check Hyperliquid universe metadata
};

// ============================================================================
// CLIENT INITIALIZATION
// ============================================================================

let exchangeClient: ExchangeClient | null = null;
let infoClient: InfoClient | null = null;

function getPrivateKey(): string {
  const key = process.env.HL_PRIVATE_KEY;
  if (!key) {
    throw new Error("HL_PRIVATE_KEY not set in environment");
  }
  return key.startsWith("0x") ? key : `0x${key}`;
}

function getExchangeClient(): ExchangeClient {
  if (!exchangeClient) {
    const wallet = privateKeyToAccount(getPrivateKey() as `0x${string}`);
    const transport = new HttpTransport({ url: BASE_URL });
    exchangeClient = new ExchangeClient({ wallet, transport });
  }
  return exchangeClient;
}

function getInfoClient(): InfoClient {
  if (!infoClient) {
    const transport = new HttpTransport({ url: BASE_URL });
    infoClient = new InfoClient({ transport });
  }
  return infoClient;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getAssetIndex(ticker: string): number {
  const index = ASSET_INDEX[ticker.toUpperCase()];
  if (index === undefined) {
    throw new Error(`Unknown asset: ${ticker}. Add to ASSET_INDEX mapping.`);
  }
  return index;
}

async function getCurrentMidPrice(ticker: string): Promise<number> {
  const info = getInfoClient();
  const mids = await info.allMids();
  const price = mids[ticker.toUpperCase()];
  if (!price) {
    throw new Error(`No price found for ${ticker}`);
  }
  return parseFloat(price);
}

function calculateOrderPrice(
  midPrice: number,
  isBuy: boolean,
  slippage: number = DEFAULT_SLIPPAGE
): string {
  // For buys, go above mid; for sells, go below mid
  const factor = isBuy ? 1 + slippage : 1 - slippage;
  return (midPrice * factor).toFixed(1);
}

// ============================================================================
// EXECUTION FUNCTIONS
// ============================================================================

/**
 * Place a market order on Hyperliquid
 * Uses IOC (Immediate-or-Cancel) with slippage for market-like execution
 */
export async function executeMarketOrder(
  params: HLOrderParams
): Promise<HLExecutionResult> {
  try {
    const exchange = getExchangeClient();
    const assetIndex = getAssetIndex(params.ticker);
    const isBuy = params.direction === "long";

    // Get current price and calculate order price with slippage
    const midPrice = await getCurrentMidPrice(params.ticker);
    const orderPrice = calculateOrderPrice(midPrice, isBuy);

    // Validate minimum order value
    const orderValue = params.size * midPrice;
    if (orderValue < MIN_ORDER_VALUE) {
      return {
        success: false,
        error: `Order value $${orderValue.toFixed(2)} below minimum $${MIN_ORDER_VALUE}`,
      };
    }

    console.log(
      `[hl] Placing ${isBuy ? "LONG" : "SHORT"} ${params.ticker} ` +
        `size=${params.size} price=${orderPrice} (mid=${midPrice})`
    );

    // Update leverage if specified
    if (params.leverage) {
      await exchange.updateLeverage({
        asset: assetIndex,
        isCross: true,
        leverage: params.leverage,
      });
    }

    // Place IOC order (market-like)
    const result = await exchange.order({
      orders: [
        {
          a: assetIndex,
          b: isBuy,
          p: orderPrice,
          s: params.size.toString(),
          r: params.reduceOnly || false,
          t: {
            limit: {
              tif: "Ioc", // Immediate-or-cancel for market-like execution
            },
          },
        },
      ],
      grouping: "na",
    });

    // Parse response
    const status = result?.response?.data?.statuses?.[0];

    if (status?.filled) {
      return {
        success: true,
        orderId: status.filled.oid,
        filledSize: status.filled.totalSz,
        avgPrice: status.filled.avgPx,
      };
    }

    if (status?.resting) {
      // Order is resting (shouldn't happen with IOC, but handle it)
      return {
        success: true,
        orderId: status.resting.oid,
      };
    }

    if (status?.error) {
      return {
        success: false,
        error: status.error,
      };
    }

    return {
      success: false,
      error: "Unknown response format",
    };
  } catch (e) {
    console.error("[hl] Execution error:", e);
    return {
      success: false,
      error: String(e),
    };
  }
}

/**
 * Place a limit order on Hyperliquid
 */
export async function executeLimitOrder(
  params: HLOrderParams
): Promise<HLExecutionResult> {
  try {
    if (!params.price) {
      return { success: false, error: "Price required for limit order" };
    }

    const exchange = getExchangeClient();
    const assetIndex = getAssetIndex(params.ticker);
    const isBuy = params.direction === "long";

    console.log(
      `[hl] Placing LIMIT ${isBuy ? "LONG" : "SHORT"} ${params.ticker} ` +
        `size=${params.size} price=${params.price}`
    );

    // Update leverage if specified
    if (params.leverage) {
      await exchange.updateLeverage({
        asset: assetIndex,
        isCross: true,
        leverage: params.leverage,
      });
    }

    const result = await exchange.order({
      orders: [
        {
          a: assetIndex,
          b: isBuy,
          p: params.price.toString(),
          s: params.size.toString(),
          r: params.reduceOnly || false,
          t: {
            limit: {
              tif: "Gtc", // Good-til-canceled
            },
          },
        },
      ],
      grouping: "na",
    });

    const status = result?.response?.data?.statuses?.[0];

    if (status?.filled) {
      return {
        success: true,
        orderId: status.filled.oid,
        filledSize: status.filled.totalSz,
        avgPrice: status.filled.avgPx,
      };
    }

    if (status?.resting) {
      return {
        success: true,
        orderId: status.resting.oid,
      };
    }

    if (status?.error) {
      return {
        success: false,
        error: status.error,
      };
    }

    return { success: false, error: "Unknown response format" };
  } catch (e) {
    console.error("[hl] Limit order error:", e);
    return { success: false, error: String(e) };
  }
}

/**
 * Close an existing position
 */
export async function closePosition(
  ticker: string,
  size: number,
  direction: Direction
): Promise<HLExecutionResult> {
  // To close, we trade in the opposite direction with reduceOnly
  const closeDirection = direction === "long" ? "short" : "long";

  return executeMarketOrder({
    ticker,
    direction: closeDirection as Direction,
    size,
    reduceOnly: true,
  });
}

/**
 * Get current position for an asset
 */
export async function getPosition(
  ticker: string
): Promise<{ size: number; entryPrice: number; pnl: number } | null> {
  try {
    const info = getInfoClient();
    const wallet = privateKeyToAccount(getPrivateKey() as `0x${string}`);

    const state = await info.clearinghouseState({ user: wallet.address });
    const positions = state?.assetPositions || [];

    const position = positions.find(
      (p: any) => p.position?.coin?.toUpperCase() === ticker.toUpperCase()
    );

    if (!position?.position?.szi || parseFloat(position.position.szi) === 0) {
      return null;
    }

    return {
      size: Math.abs(parseFloat(position.position.szi)),
      entryPrice: parseFloat(position.position.entryPx),
      pnl: parseFloat(position.position.unrealizedPnl),
    };
  } catch (e) {
    console.error("[hl] Get position error:", e);
    return null;
  }
}

/**
 * Get account balance
 */
export async function getBalance(): Promise<number> {
  try {
    const info = getInfoClient();
    const wallet = privateKeyToAccount(getPrivateKey() as `0x${string}`);

    const state = await info.clearinghouseState({ user: wallet.address });
    return parseFloat(state?.marginSummary?.accountValue || "0");
  } catch (e) {
    console.error("[hl] Get balance error:", e);
    return 0;
  }
}

// ============================================================================
// MAIN EXECUTION ENTRY POINT
// ============================================================================

/**
 * Execute a trade on Hyperliquid
 * Main entry point for the execution layer
 */
export async function execute(params: HLOrderParams): Promise<HLExecutionResult> {
  // Check if private key is configured
  if (!process.env.HL_PRIVATE_KEY) {
    return {
      success: false,
      error: "HL_PRIVATE_KEY not configured. Set in .env for live trading.",
    };
  }

  // Check paper mode
  if (process.env.PAPER_MODE === "true") {
    console.log("[hl] PAPER MODE - would execute:", params);
    return {
      success: true,
      orderId: Date.now(),
      filledSize: params.size.toString(),
      avgPrice: (await getCurrentMidPrice(params.ticker)).toString(),
    };
  }

  // Execute real order
  if (params.price) {
    return executeLimitOrder(params);
  }
  return executeMarketOrder(params);
}

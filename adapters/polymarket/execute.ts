/**
 * Polymarket Execution Layer
 *
 * Places real orders on Polymarket CLOB (Central Limit Order Book)
 * Uses @polymarket/clob-client SDK with EIP-712 signing
 */

import { ClobClient, ApiKeyCreds, Side, OrderType } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";
import type { Direction } from "../../types";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLOB_URL = "https://clob.polymarket.com";
const GAMMA_API = "https://gamma-api.polymarket.com";
const CHAIN_ID = 137; // Polygon

// Signature types
const SIG_TYPE_EOA = 0;
const SIG_TYPE_POLY_PROXY = 1;
const SIG_TYPE_GNOSIS_SAFE = 2;

// Default signature type (most users have GNOSIS_SAFE)
const DEFAULT_SIG_TYPE = SIG_TYPE_GNOSIS_SAFE;

// ============================================================================
// TYPES
// ============================================================================

export interface PMExecutionResult {
  success: boolean;
  orderId?: string;
  filledSize?: number;
  avgPrice?: number;
  error?: string;
}

export interface PMOrderParams {
  conditionId: string; // Market condition ID
  direction: Direction; // "yes" or "no"
  size: number; // Amount in USDC for market orders, or token count for limit
  price?: number; // If not provided, uses market order (FOK)
  orderType?: "market" | "limit";
}

interface MarketData {
  conditionId: string;
  yesTokenId: string;
  noTokenId: string;
  tickSize: string;
  negRisk: boolean;
  question: string;
}

// Cache for market data
const marketCache = new Map<string, MarketData>();

// ============================================================================
// CLIENT INITIALIZATION
// ============================================================================

let clobClient: ClobClient | null = null;

function getWallet(): Wallet {
  const pk = process.env.PM_PRIVATE_KEY;
  if (!pk) {
    throw new Error("PM_PRIVATE_KEY not set in environment");
  }
  return new Wallet(pk.startsWith("0x") ? pk : `0x${pk}`);
}

function getApiCreds(): ApiKeyCreds | undefined {
  const key = process.env.PM_API_KEY;
  const secret = process.env.PM_API_SECRET;
  const passphrase = process.env.PM_PASSPHRASE;

  if (key && secret && passphrase) {
    return { key, secret, passphrase };
  }
  return undefined;
}

async function getClobClient(): Promise<ClobClient> {
  if (!clobClient) {
    const wallet = getWallet();
    const creds = getApiCreds();
    const funder = process.env.PM_FUNDER_ADDRESS;
    const sigType = parseInt(process.env.PM_SIG_TYPE || String(DEFAULT_SIG_TYPE));

    clobClient = new ClobClient(
      CLOB_URL,
      CHAIN_ID,
      wallet,
      creds,
      sigType,
      funder
    );

    // If no creds provided, derive them
    if (!creds) {
      console.log("[pm] Deriving API credentials...");
      const derivedCreds = await clobClient.createOrDeriveApiCreds();
      console.log("[pm] API Key:", derivedCreds.key);
      console.log("[pm] Save these to .env as PM_API_KEY, PM_API_SECRET, PM_PASSPHRASE");

      // Reinitialize with derived creds
      clobClient = new ClobClient(
        CLOB_URL,
        CHAIN_ID,
        wallet,
        derivedCreds,
        sigType,
        funder
      );
    }
  }
  return clobClient;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch market data from Gamma API
 */
async function getMarketData(conditionId: string): Promise<MarketData> {
  // Check cache
  if (marketCache.has(conditionId)) {
    return marketCache.get(conditionId)!;
  }

  try {
    // Try fetching by condition ID
    const response = await fetch(
      `${GAMMA_API}/markets?conditionId=${conditionId}`
    );

    if (!response.ok) {
      throw new Error(`Gamma API error: ${response.status}`);
    }

    const markets = await response.json();
    if (!markets || markets.length === 0) {
      throw new Error(`Market not found: ${conditionId}`);
    }

    const market = markets[0];
    const tokenIds = market.clobTokenIds?.split(",") || [];

    const data: MarketData = {
      conditionId: market.conditionId,
      yesTokenId: tokenIds[0] || "",
      noTokenId: tokenIds[1] || "",
      tickSize: market.tickSize || "0.01",
      negRisk: market.negRisk || false,
      question: market.question || "",
    };

    marketCache.set(conditionId, data);
    return data;
  } catch (e) {
    console.error("[pm] Failed to fetch market data:", e);
    throw e;
  }
}

/**
 * Get token ID for a direction
 */
function getTokenId(market: MarketData, direction: Direction): string {
  if (direction === "yes" || direction === "long") {
    return market.yesTokenId;
  }
  return market.noTokenId;
}

/**
 * Round price to tick size
 */
function roundToTick(price: number, tickSize: string): number {
  const tick = parseFloat(tickSize);
  return Math.round(price / tick) * tick;
}

// ============================================================================
// EXECUTION FUNCTIONS
// ============================================================================

/**
 * Place a market order (FOK - Fill-or-Kill)
 */
export async function executeMarketOrder(
  params: PMOrderParams
): Promise<PMExecutionResult> {
  try {
    const client = await getClobClient();
    const market = await getMarketData(params.conditionId);
    const tokenId = getTokenId(market, params.direction);
    const side = params.direction === "yes" || params.direction === "long" ? Side.BUY : Side.SELL;

    console.log(
      `[pm] Placing MARKET ${side === Side.BUY ? "BUY" : "SELL"} ` +
        `${params.direction.toUpperCase()} $${params.size} on "${market.question.slice(0, 50)}..."`
    );

    const order = await client.createMarketOrder({
      tokenID: tokenId,
      amount: params.size,
      side,
    });

    const response = await client.postOrder(order, OrderType.FOK);

    if (response?.success) {
      return {
        success: true,
        orderId: response.orderID,
      };
    }

    return {
      success: false,
      error: response?.errorMsg || "Order failed",
    };
  } catch (e) {
    console.error("[pm] Market order error:", e);
    return {
      success: false,
      error: String(e),
    };
  }
}

/**
 * Place a limit order (GTC - Good-til-Canceled)
 */
export async function executeLimitOrder(
  params: PMOrderParams
): Promise<PMExecutionResult> {
  try {
    if (!params.price) {
      return { success: false, error: "Price required for limit order" };
    }

    const client = await getClobClient();
    const market = await getMarketData(params.conditionId);
    const tokenId = getTokenId(market, params.direction);
    const side = params.direction === "yes" || params.direction === "long" ? Side.BUY : Side.SELL;

    // Round price to tick size
    const price = roundToTick(params.price, market.tickSize);

    console.log(
      `[pm] Placing LIMIT ${side === Side.BUY ? "BUY" : "SELL"} ` +
        `${params.direction.toUpperCase()} ${params.size} @ $${price}`
    );

    const response = await client.createAndPostOrder(
      {
        tokenID: tokenId,
        price,
        side,
        size: params.size,
      },
      { tickSize: market.tickSize, negRisk: market.negRisk },
      OrderType.GTC
    );

    if (response?.success) {
      return {
        success: true,
        orderId: response.orderID,
      };
    }

    return {
      success: false,
      error: response?.errorMsg || "Order failed",
    };
  } catch (e) {
    console.error("[pm] Limit order error:", e);
    return {
      success: false,
      error: String(e),
    };
  }
}

/**
 * Cancel an order
 */
export async function cancelOrder(orderId: string): Promise<boolean> {
  try {
    const client = await getClobClient();
    await client.cancelOrder({ orderID: orderId });
    return true;
  } catch (e) {
    console.error("[pm] Cancel order error:", e);
    return false;
  }
}

/**
 * Get open orders
 */
export async function getOpenOrders(): Promise<any[]> {
  try {
    const client = await getClobClient();
    return await client.getOpenOrders();
  } catch (e) {
    console.error("[pm] Get open orders error:", e);
    return [];
  }
}

/**
 * Get USDC balance
 */
export async function getBalance(): Promise<number> {
  try {
    const client = await getClobClient();
    const allowance = await client.getBalanceAllowance();
    return parseFloat(allowance?.balance || "0");
  } catch (e) {
    console.error("[pm] Get balance error:", e);
    return 0;
  }
}

// ============================================================================
// MAIN EXECUTION ENTRY POINT
// ============================================================================

/**
 * Execute a trade on Polymarket
 * Main entry point for the execution layer
 */
export async function execute(params: PMOrderParams): Promise<PMExecutionResult> {
  // Check if private key is configured
  if (!process.env.PM_PRIVATE_KEY) {
    return {
      success: false,
      error: "PM_PRIVATE_KEY not configured. Set in .env for live trading.",
    };
  }

  // Check paper mode
  if (process.env.PAPER_MODE === "true") {
    console.log("[pm] PAPER MODE - would execute:", params);
    return {
      success: true,
      orderId: `paper_${Date.now()}`,
      filledSize: params.size,
      avgPrice: params.price || 0.5,
    };
  }

  // Execute real order
  if (params.price && params.orderType === "limit") {
    return executeLimitOrder(params);
  }
  return executeMarketOrder(params);
}

/**
 * Search for markets by keyword
 */
export async function searchMarkets(query: string): Promise<MarketData[]> {
  try {
    const response = await fetch(
      `${GAMMA_API}/markets?_limit=10&active=true&closed=false&q=${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      return [];
    }

    const markets = await response.json();
    return markets.map((m: any) => {
      const tokenIds = m.clobTokenIds?.split(",") || [];
      return {
        conditionId: m.conditionId,
        yesTokenId: tokenIds[0] || "",
        noTokenId: tokenIds[1] || "",
        tickSize: m.tickSize || "0.01",
        negRisk: m.negRisk || false,
        question: m.question || "",
      };
    });
  } catch (e) {
    console.error("[pm] Search markets error:", e);
    return [];
  }
}

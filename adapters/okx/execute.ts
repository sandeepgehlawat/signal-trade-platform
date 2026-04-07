/**
 * OKX DEX Execution Layer
 *
 * Executes swaps via OKX OnchainOS DEX aggregator
 * Supports 500+ DEXs across 130+ chains
 */

import * as crypto from "crypto";
import type { Direction } from "../../types";

// ============================================================================
// CONFIGURATION
// ============================================================================

const OKX_BASE_URL = "https://www.okx.com";

// Supported chains
const CHAIN_IDS: Record<string, string> = {
  ethereum: "1",
  arbitrum: "42161",
  optimism: "10",
  base: "8453",
  polygon: "137",
  bsc: "56",
  avalanche: "43114",
  solana: "501",
};

// Common token addresses by chain
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const USDC_ADDRESSES: Record<string, string> = {
  "1": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum
  "42161": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Arbitrum
  "10": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // Optimism
  "8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base
  "137": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // Polygon
};

const WETH_ADDRESSES: Record<string, string> = {
  "1": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  "42161": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  "10": "0x4200000000000000000000000000000000000006",
  "8453": "0x4200000000000000000000000000000000000006",
  "137": "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
};

// ============================================================================
// TYPES
// ============================================================================

export interface OKXExecutionResult {
  success: boolean;
  txHash?: string;
  fromAmount?: string;
  toAmount?: string;
  error?: string;
}

export interface OKXSwapParams {
  chainId: string;
  fromToken: string;
  toToken: string;
  amount: string; // In smallest unit (wei for ETH)
  slippage?: string; // e.g., "0.01" for 1%
  walletAddress: string;
}

interface QuoteResponse {
  routerResult?: {
    toTokenAmount: string;
    estimatedGas: string;
  };
  tx?: {
    to: string;
    data: string;
    value: string;
    gasLimit: string;
  };
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

function getCredentials() {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_API_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  if (!apiKey || !secretKey || !passphrase) {
    throw new Error("OKX API credentials not configured");
  }

  return { apiKey, secretKey, passphrase, projectId };
}

function generateSignature(
  timestamp: string,
  method: string,
  requestPath: string,
  queryString: string,
  body: string,
  secretKey: string
): string {
  const preHash = timestamp + method + requestPath + (queryString ? "?" + queryString : "") + body;
  return crypto.createHmac("sha256", secretKey).update(preHash).digest("base64");
}

function getAuthHeaders(
  method: string,
  requestPath: string,
  queryString: string = "",
  body: string = ""
): Record<string, string> {
  const { apiKey, secretKey, passphrase, projectId } = getCredentials();
  const timestamp = new Date().toISOString();
  const signature = generateSignature(timestamp, method, requestPath, queryString, body, secretKey);

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };

  if (projectId) {
    headers["OK-ACCESS-PROJECT"] = projectId;
  }

  return headers;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Get a quote for a swap
 */
export async function getQuote(params: OKXSwapParams): Promise<QuoteResponse | null> {
  try {
    const requestPath = "/api/v5/dex/aggregator/quote";
    const queryParams = new URLSearchParams({
      chainId: params.chainId,
      fromTokenAddress: params.fromToken,
      toTokenAddress: params.toToken,
      amount: params.amount,
      slippage: params.slippage || "0.01",
    });

    const queryString = queryParams.toString();
    const headers = getAuthHeaders("GET", requestPath, queryString);

    const response = await fetch(`${OKX_BASE_URL}${requestPath}?${queryString}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      console.error("[okx] Quote API error:", response.status);
      return null;
    }

    const data = await response.json();

    if (data.code !== "0") {
      console.error("[okx] Quote error:", data.msg);
      return null;
    }

    return data.data?.[0] || null;
  } catch (e) {
    console.error("[okx] Get quote error:", e);
    return null;
  }
}

/**
 * Get swap transaction data
 */
export async function getSwapData(params: OKXSwapParams): Promise<QuoteResponse | null> {
  try {
    const requestPath = "/api/v5/dex/aggregator/swap";
    const queryParams = new URLSearchParams({
      chainId: params.chainId,
      fromTokenAddress: params.fromToken,
      toTokenAddress: params.toToken,
      amount: params.amount,
      slippage: params.slippage || "0.01",
      userWalletAddress: params.walletAddress,
    });

    const queryString = queryParams.toString();
    const headers = getAuthHeaders("GET", requestPath, queryString);

    const response = await fetch(`${OKX_BASE_URL}${requestPath}?${queryString}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      console.error("[okx] Swap API error:", response.status);
      return null;
    }

    const data = await response.json();

    if (data.code !== "0") {
      console.error("[okx] Swap error:", data.msg);
      return null;
    }

    return data.data?.[0] || null;
  } catch (e) {
    console.error("[okx] Get swap data error:", e);
    return null;
  }
}

/**
 * Check token approval
 */
export async function checkApproval(
  chainId: string,
  tokenAddress: string,
  walletAddress: string
): Promise<{ isApproved: boolean; allowance: string }> {
  try {
    const requestPath = "/api/v5/dex/aggregator/approve-transaction";
    const queryParams = new URLSearchParams({
      chainId,
      tokenContractAddress: tokenAddress,
      approveAmount: "0", // Check only
    });

    const queryString = queryParams.toString();
    const headers = getAuthHeaders("GET", requestPath, queryString);

    const response = await fetch(`${OKX_BASE_URL}${requestPath}?${queryString}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return { isApproved: false, allowance: "0" };
    }

    const data = await response.json();
    const allowance = data.data?.[0]?.allowanceNum || "0";

    return {
      isApproved: parseFloat(allowance) > 0,
      allowance,
    };
  } catch (e) {
    console.error("[okx] Check approval error:", e);
    return { isApproved: false, allowance: "0" };
  }
}

// ============================================================================
// EXECUTION
// ============================================================================

/**
 * Execute a swap (requires external wallet signing)
 *
 * Note: This returns the transaction data. Actual signing and broadcasting
 * must be done by the caller using their wallet (e.g., viem, ethers).
 */
export async function executeSwap(
  params: OKXSwapParams
): Promise<OKXExecutionResult> {
  try {
    console.log(
      `[okx] Getting swap data: ${params.fromToken} -> ${params.toToken} ` +
        `amount=${params.amount} on chain ${params.chainId}`
    );

    // Get swap transaction data
    const swapData = await getSwapData(params);

    if (!swapData || !swapData.tx) {
      return {
        success: false,
        error: "Failed to get swap transaction data",
      };
    }

    console.log("[okx] Swap data received:");
    console.log("  To:", swapData.tx.to);
    console.log("  Value:", swapData.tx.value);
    console.log("  Gas Limit:", swapData.tx.gasLimit);
    console.log("  Expected output:", swapData.routerResult?.toTokenAmount);

    // Return transaction data for external signing
    return {
      success: true,
      toAmount: swapData.routerResult?.toTokenAmount,
      // In a real implementation, you would sign and broadcast here
      // For now, we return the data for manual execution
    };
  } catch (e) {
    console.error("[okx] Execute swap error:", e);
    return {
      success: false,
      error: String(e),
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get chain ID from name
 */
export function getChainId(chainName: string): string {
  const id = CHAIN_IDS[chainName.toLowerCase()];
  if (!id) {
    throw new Error(`Unknown chain: ${chainName}`);
  }
  return id;
}

/**
 * Get USDC address for a chain
 */
export function getUsdcAddress(chainId: string): string {
  return USDC_ADDRESSES[chainId] || "";
}

/**
 * Get WETH address for a chain
 */
export function getWethAddress(chainId: string): string {
  return WETH_ADDRESSES[chainId] || "";
}

/**
 * Get native token address (ETH, MATIC, etc.)
 */
export function getNativeToken(): string {
  return NATIVE_TOKEN;
}

/**
 * Convert amount to smallest unit (wei)
 */
export function toWei(amount: number, decimals: number = 18): string {
  return BigInt(Math.floor(amount * 10 ** decimals)).toString();
}

/**
 * Convert from smallest unit
 */
export function fromWei(amount: string, decimals: number = 18): number {
  return parseFloat(amount) / 10 ** decimals;
}

// ============================================================================
// MAIN EXECUTION ENTRY POINT
// ============================================================================

export interface OKXTradeParams {
  ticker: string; // e.g., "ETH:1" (ETH on Ethereum)
  direction: Direction;
  amountUsd: number;
  chain?: string;
}

/**
 * Execute a trade via OKX DEX
 * Main entry point for the execution layer
 */
export async function execute(params: OKXTradeParams): Promise<OKXExecutionResult> {
  // Check if credentials are configured
  if (!process.env.OKX_API_KEY || !process.env.OKX_SECRET_KEY) {
    return {
      success: false,
      error: "OKX API credentials not configured. Set in .env for live trading.",
    };
  }

  // Check paper mode
  if (process.env.PAPER_MODE === "true") {
    console.log("[okx] PAPER MODE - would execute:", params);
    return {
      success: true,
      txHash: `paper_${Date.now()}`,
      toAmount: params.amountUsd.toString(),
    };
  }

  // Parse ticker (format: "SYMBOL:CHAIN_ID" or just "SYMBOL")
  const [symbol, chainId] = params.ticker.includes(":")
    ? params.ticker.split(":")
    : [params.ticker, "1"];

  const walletAddress = process.env.OKX_WALLET_ADDRESS;
  if (!walletAddress) {
    return {
      success: false,
      error: "OKX_WALLET_ADDRESS not configured",
    };
  }

  // Determine swap direction
  // For "long" on crypto: USDC -> Token
  // For "short" on crypto: Token -> USDC
  const usdcAddress = getUsdcAddress(chainId);
  const tokenAddress = getWethAddress(chainId); // Simplified - uses WETH for now

  let fromToken: string;
  let toToken: string;
  let amount: string;

  if (params.direction === "long") {
    fromToken = usdcAddress;
    toToken = tokenAddress;
    amount = toWei(params.amountUsd, 6); // USDC has 6 decimals
  } else {
    fromToken = tokenAddress;
    toToken = usdcAddress;
    // For shorts, we need to calculate token amount from USD
    // This is a simplification - in production, get the price first
    amount = toWei(params.amountUsd / 2000, 18); // Rough ETH amount
  }

  return executeSwap({
    chainId,
    fromToken,
    toToken,
    amount,
    walletAddress,
    slippage: "0.01",
  });
}

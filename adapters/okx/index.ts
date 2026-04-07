/**
 * Signal Trade - OKX OnchainOS Adapter
 *
 * Integration with OKX OnchainOS DEX aggregator
 * - Multi-chain token discovery
 * - DEX aggregation for best prices
 * - Historical pricing via wallet API
 *
 * API Docs: https://web3.okx.com/onchainos/dev-docs
 */

import crypto from "crypto";
import type {
  VenueAdapter,
  InstrumentMatch,
  InstrumentDetails,
  Liquidity,
} from "../../types";

// ============================================================================
// CONFIGURATION
// ============================================================================

const OKX_API_BASE = "https://web3.okx.com/api/v5";
const OKX_DEX_BASE = "https://web3.okx.com/api/v5/dex/aggregator";

// Chain IDs
const CHAINS: Record<string, { id: string; name: string; native: string }> = {
  ethereum: { id: "1", name: "Ethereum", native: "ETH" },
  polygon: { id: "137", name: "Polygon", native: "MATIC" },
  arbitrum: { id: "42161", name: "Arbitrum", native: "ETH" },
  optimism: { id: "10", name: "Optimism", native: "ETH" },
  bsc: { id: "56", name: "BNB Chain", native: "BNB" },
  avalanche: { id: "43114", name: "Avalanche", native: "AVAX" },
  base: { id: "8453", name: "Base", native: "ETH" },
};

// Native token address for all EVM chains
const NATIVE_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

// ============================================================================
// TYPES
// ============================================================================

interface OkxToken {
  tokenContractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  decimals: string;
  tokenLogoUrl?: string;
}

interface OkxQuoteResponse {
  code: string;
  msg: string;
  data: Array<{
    chainId: string;
    fromTokenAmount: string;
    toTokenAmount: string;
    tradeFee: string;
    estimateGasFee: string;
    priceImpactPercentage: string;
    dexRouterList: Array<{
      router: string;
      routerPercent: string;
      subRouterList: Array<{
        dexProtocol: Array<{ dexName: string; percent: string }>;
        fromToken: { tokenSymbol: string };
        toToken: { tokenSymbol: string };
      }>;
    }>;
  }>;
}

interface OkxTokenListResponse {
  code: string;
  msg: string;
  data: OkxToken[];
}

interface OkxHistoricalPriceResponse {
  code: string;
  msg: string;
  data: {
    prices: Array<{ time: string; price: string }>;
  };
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

function getOkxCredentials(): {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  projectId: string;
} | null {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_API_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  if (!apiKey || !secretKey || !passphrase) {
    return null;
  }

  return { apiKey, secretKey, passphrase, projectId: projectId || "" };
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
  queryString = "",
  body = ""
): Record<string, string> {
  const creds = getOkxCredentials();

  if (!creds) {
    // Return empty headers if no credentials - API will fail gracefully
    return { "Content-Type": "application/json" };
  }

  const timestamp = new Date().toISOString();
  const signature = generateSignature(
    timestamp,
    method,
    requestPath,
    queryString,
    body,
    creds.secretKey
  );

  return {
    "OK-ACCESS-KEY": creds.apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": creds.passphrase,
    "OK-ACCESS-PROJECT": creds.projectId,
    "Content-Type": "application/json",
  };
}

// ============================================================================
// TOKEN CACHE
// ============================================================================

interface TokenCacheEntry {
  tokens: OkxToken[];
  fetchedAt: number;
}

const tokenCache: Map<string, TokenCacheEntry> = new Map();
const TOKEN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Common tokens with addresses for fallback
const COMMON_TOKENS: Record<string, Record<string, { address: string; decimals: number }>> = {
  "1": { // Ethereum
    ETH: { address: NATIVE_TOKEN_ADDRESS, decimals: 18 },
    WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
    USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
    DAI: { address: "0x6B175474E89094C44Da98b954EesdfCD2F", decimals: 18 },
    LINK: { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
    UNI: { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
  },
  "42161": { // Arbitrum
    ETH: { address: NATIVE_TOKEN_ADDRESS, decimals: 18 },
    ARB: { address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18 },
    USDC: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    WBTC: { address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", decimals: 8 },
    GMX: { address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", decimals: 18 },
  },
  "10": { // Optimism
    ETH: { address: NATIVE_TOKEN_ADDRESS, decimals: 18 },
    OP: { address: "0x4200000000000000000000000000000000000042", decimals: 18 },
    USDC: { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
  },
  "8453": { // Base
    ETH: { address: NATIVE_TOKEN_ADDRESS, decimals: 18 },
    USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  },
  "137": { // Polygon
    MATIC: { address: NATIVE_TOKEN_ADDRESS, decimals: 18 },
    USDC: { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
    WETH: { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
  },
};

// ============================================================================
// API CALLS
// ============================================================================

async function fetchOkxApi<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T | null> {
  try {
    const queryString = new URLSearchParams(params).toString();
    const requestPath = endpoint;
    const headers = getAuthHeaders("GET", requestPath, queryString);

    const url = `${OKX_DEX_BASE}${endpoint}${queryString ? "?" + queryString : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error("[okx] Authentication failed - check API credentials in .env");
      } else if (response.status === 429) {
        console.error("[okx] Rate limited - wait before retrying");
      } else {
        console.error(`[okx] API error: ${response.status}`);
      }
      return null;
    }

    const data = await response.json();

    if (data.code !== "0") {
      console.error(`[okx] API error code ${data.code}: ${data.msg}`);
      return null;
    }

    return data as T;
  } catch (e) {
    console.error("[okx] API call failed:", e);
    return null;
  }
}

async function fetchTokenList(chainId: string): Promise<OkxToken[]> {
  const cached = tokenCache.get(chainId);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < TOKEN_CACHE_TTL_MS) {
    return cached.tokens;
  }

  const data = await fetchOkxApi<OkxTokenListResponse>("/all-tokens", {
    chainId,
  });

  if (data?.data && data.data.length > 0) {
    tokenCache.set(chainId, { tokens: data.data, fetchedAt: now });
    return data.data;
  }

  // Return cached even if stale
  if (cached) return cached.tokens;

  // Convert fallback to OkxToken format
  const fallback = COMMON_TOKENS[chainId];
  if (fallback) {
    return Object.entries(fallback).map(([symbol, info]) => ({
      tokenContractAddress: info.address,
      tokenSymbol: symbol,
      tokenName: symbol,
      decimals: info.decimals.toString(),
    }));
  }

  return [];
}

// ============================================================================
// PRICING
// ============================================================================

export async function getCurrentPrice(ticker: string): Promise<number | null> {
  // Ticker format: SYMBOL or SYMBOL:CHAINID
  const [symbol, chainIdParam] = ticker.split(":");
  const chainId = chainIdParam || "1"; // Default to Ethereum

  // Get token info
  const tokens = await fetchTokenList(chainId);
  const token = tokens.find(
    (t) => t.tokenSymbol.toUpperCase() === symbol.toUpperCase()
  );

  if (!token) {
    // Try fallback
    const fallback = COMMON_TOKENS[chainId]?.[symbol.toUpperCase()];
    if (!fallback) return null;
  }

  const tokenAddress = token?.tokenContractAddress ||
    COMMON_TOKENS[chainId]?.[symbol.toUpperCase()]?.address;

  if (!tokenAddress) return null;

  // Stablecoins are ~$1
  if (["USDC", "USDT", "DAI", "BUSD"].includes(symbol.toUpperCase())) {
    return 1.0;
  }

  // Get USDC address for quote
  const usdcAddress = COMMON_TOKENS[chainId]?.USDC?.address;
  if (!usdcAddress) return null;

  // Get quote: 1 token -> USDC
  const decimals = token?.decimals
    ? parseInt(token.decimals)
    : COMMON_TOKENS[chainId]?.[symbol.toUpperCase()]?.decimals || 18;

  const amount = (10n ** BigInt(decimals)).toString();

  const quote = await fetchOkxApi<OkxQuoteResponse>("/quote", {
    chainId,
    fromTokenAddress: tokenAddress,
    toTokenAddress: usdcAddress,
    amount,
    slippage: "0.5",
  });

  if (!quote?.data?.[0]) return null;

  // USDC has 6 decimals
  const toAmount = parseFloat(quote.data[0].toTokenAmount);
  return toAmount / 1_000_000;
}

export async function getHistoricalPrice(
  ticker: string,
  timestamp: string
): Promise<number | null> {
  // Ticker format: SYMBOL or SYMBOL:CHAINID
  const [symbol, chainIdParam] = ticker.split(":");
  const chainId = chainIdParam || "1";

  // Get token address
  const tokens = await fetchTokenList(chainId);
  const token = tokens.find(
    (t) => t.tokenSymbol.toUpperCase() === symbol.toUpperCase()
  );

  const tokenAddress = token?.tokenContractAddress ||
    COMMON_TOKENS[chainId]?.[symbol.toUpperCase()]?.address;

  if (!tokenAddress) {
    // Fall back to CoinGecko for historical
    try {
      const { getHistoricalPriceByTicker } = await import("../../shared/coingecko");
      return getHistoricalPriceByTicker(symbol, timestamp);
    } catch {
      return null;
    }
  }

  // Use OKX historical price endpoint
  const date = new Date(timestamp);
  const begin = date.getTime().toString();
  const end = (date.getTime() + 3600000).toString(); // +1 hour window

  try {
    const queryString = new URLSearchParams({
      chainIndex: chainId,
      tokenAddress: tokenAddress === NATIVE_TOKEN_ADDRESS ? "" : tokenAddress,
      begin,
      end,
      period: "1h",
      limit: "1",
    }).toString();

    const requestPath = "/wallet/token/historical-price";
    const headers = getAuthHeaders("GET", requestPath, queryString);
    const url = `${OKX_API_BASE}${requestPath}?${queryString}`;

    const response = await fetch(url, { headers });
    if (!response.ok) return null;

    const data: OkxHistoricalPriceResponse = await response.json();
    if (data.code !== "0" || !data.data?.prices?.length) {
      // Fall back to CoinGecko
      const { getHistoricalPriceByTicker } = await import("../../shared/coingecko");
      return getHistoricalPriceByTicker(symbol, timestamp);
    }

    return parseFloat(data.data.prices[0].price);
  } catch (e) {
    console.error("[okx] Historical price failed:", e);
    // Fall back to CoinGecko
    try {
      const { getHistoricalPriceByTicker } = await import("../../shared/coingecko");
      return getHistoricalPriceByTicker(symbol, timestamp);
    } catch {
      return null;
    }
  }
}

// ============================================================================
// INSTRUMENT SEARCH
// ============================================================================

export async function searchInstruments(query: string): Promise<InstrumentMatch[]> {
  const queryLower = query.toLowerCase();
  const matches: InstrumentMatch[] = [];
  const seenTickers = new Set<string>();

  // Search across main chains
  const chainsToSearch = ["1", "42161", "10", "8453"]; // ETH, ARB, OP, Base

  for (const chainId of chainsToSearch) {
    const chainInfo = Object.entries(CHAINS).find(([, c]) => c.id === chainId)?.[1];
    if (!chainInfo) continue;

    const tokens = await fetchTokenList(chainId);

    for (const token of tokens) {
      const symbolLower = token.tokenSymbol.toLowerCase();
      const nameLower = token.tokenName.toLowerCase();

      // Skip if already found this symbol
      if (seenTickers.has(symbolLower)) continue;

      if (symbolLower.includes(queryLower) || nameLower.includes(queryLower)) {
        seenTickers.add(symbolLower);

        let relevance: "direct" | "proxy" | "lateral" = "lateral";
        if (symbolLower === queryLower) {
          relevance = "direct";
        } else if (symbolLower.includes(queryLower)) {
          relevance = "proxy";
        }

        const highLiquidityTokens = ["ETH", "WETH", "WBTC", "USDC", "USDT", "DAI", "ARB", "OP"];
        const liquidity: Liquidity = highLiquidityTokens.includes(token.tokenSymbol.toUpperCase())
          ? "high"
          : "medium";

        matches.push({
          ticker: `${token.tokenSymbol}:${chainId}`,
          name: `${token.tokenName} (${chainInfo.name})`,
          platform: "okx",
          instrument_type: "spot",
          relevance,
          explanation: `${token.tokenName} on ${chainInfo.name}, tradeable via OKX DEX aggregator`,
          liquidity,
        });
      }
    }
  }

  // Add alias matches
  const aliases: Record<string, string[]> = {
    bitcoin: ["WBTC"],
    ethereum: ["ETH", "WETH"],
    arbitrum: ["ARB"],
    optimism: ["OP"],
  };

  for (const [alias, symbols] of Object.entries(aliases)) {
    if (queryLower.includes(alias)) {
      for (const symbol of symbols) {
        if (!seenTickers.has(symbol.toLowerCase())) {
          seenTickers.add(symbol.toLowerCase());
          matches.push({
            ticker: `${symbol}:1`,
            name: `${symbol} (Ethereum)`,
            platform: "okx",
            instrument_type: "spot",
            relevance: "proxy",
            explanation: `${symbol} as proxy for ${alias}`,
            liquidity: "high",
          });
        }
      }
    }
  }

  return matches;
}

// ============================================================================
// INSTRUMENT DETAILS
// ============================================================================

export async function getInstrumentDetails(
  ticker: string
): Promise<InstrumentDetails | null> {
  const [symbol, chainIdParam] = ticker.split(":");
  const chainId = chainIdParam || "1";

  const tokens = await fetchTokenList(chainId);
  const token = tokens.find(
    (t) => t.tokenSymbol.toUpperCase() === symbol.toUpperCase()
  );

  if (!token) {
    // Check fallback
    if (!COMMON_TOKENS[chainId]?.[symbol.toUpperCase()]) return null;
  }

  const chainInfo = Object.entries(CHAINS).find(([, c]) => c.id === chainId)?.[1];
  const highLiquidityTokens = ["ETH", "WETH", "WBTC", "USDC", "USDT", "DAI"];
  const liquidity: Liquidity = highLiquidityTokens.includes(symbol.toUpperCase())
    ? "high"
    : "medium";

  return {
    ticker,
    name: token?.tokenName || symbol,
    platform: "okx",
    instrument_type: "spot",
    liquidity,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

export async function validateTicker(ticker: string): Promise<boolean> {
  const [symbol, chainIdParam] = ticker.split(":");
  const chainId = chainIdParam || "1";

  // Check fallback first (faster)
  if (COMMON_TOKENS[chainId]?.[symbol.toUpperCase()]) return true;

  const tokens = await fetchTokenList(chainId);
  return tokens.some(
    (t) => t.tokenSymbol.toUpperCase() === symbol.toUpperCase()
  );
}

// ============================================================================
// ADAPTER EXPORT
// ============================================================================

export const okxAdapter: VenueAdapter = {
  platform: "okx",
  searchInstruments,
  validateTicker,
  getCurrentPrice,
  getHistoricalPrice,
  getInstrumentDetails,
};

export default okxAdapter;

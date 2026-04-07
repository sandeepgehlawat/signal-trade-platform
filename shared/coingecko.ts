/**
 * Signal Trade - CoinGecko Integration
 *
 * Historical pricing for cryptocurrencies via CoinGecko API
 * Free tier: 10-30 calls/minute
 */

const COINGECKO_API = "https://api.coingecko.com/api/v3";

// ============================================================================
// COIN ID MAPPING
// ============================================================================

// Map common ticker symbols to CoinGecko IDs
const COIN_ID_MAP: Record<string, string> = {
  // Major coins
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  AVAX: "avalanche-2",
  MATIC: "matic-network",
  DOT: "polkadot",
  ATOM: "cosmos",
  NEAR: "near",
  FTM: "fantom",
  ALGO: "algorand",

  // L2s
  ARB: "arbitrum",
  OP: "optimism",
  IMX: "immutable-x",
  STRK: "starknet",
  ZK: "zksync",
  MANTA: "manta-network",

  // DeFi
  UNI: "uniswap",
  AAVE: "aave",
  MKR: "maker",
  CRV: "curve-dao-token",
  LDO: "lido-dao",
  COMP: "compound-governance-token",
  SUSHI: "sushi",
  SNX: "synthetix-network-token",
  YFI: "yearn-finance",
  DYDX: "dydx-chain",
  GMX: "gmx",
  PENDLE: "pendle",

  // Exchange tokens
  BNB: "binancecoin",
  FTT: "ftx-token",
  CRO: "crypto-com-chain",
  OKB: "okb",

  // Memecoins
  DOGE: "dogecoin",
  SHIB: "shiba-inu",
  PEPE: "pepe",
  FLOKI: "floki",
  BONK: "bonk",
  WIF: "dogwifcoin",

  // Wrapped assets
  WBTC: "wrapped-bitcoin",
  WETH: "weth",
  STETH: "staked-ether",

  // Stablecoins (included for completeness, always ~$1)
  USDT: "tether",
  USDC: "usd-coin",
  DAI: "dai",
  BUSD: "binance-usd",
  FRAX: "frax",

  // Other
  LINK: "chainlink",
  XRP: "ripple",
  ADA: "cardano",
  TRX: "tron",
  TON: "the-open-network",
  APT: "aptos",
  SUI: "sui",
  SEI: "sei-network",
  TIA: "celestia",
  INJ: "injective-protocol",
  RUNE: "thorchain",
  BLUR: "blur",
  PYTH: "pyth-network",
  JTO: "jito-governance-token",
  JUP: "jupiter-exchange-solana",
};

/**
 * Get CoinGecko ID from ticker symbol
 */
export function getCoinGeckoId(ticker: string): string | null {
  // Clean up ticker (remove chain suffix if present, e.g., "ETH:1" -> "ETH")
  const cleanTicker = ticker.split(":")[0].toUpperCase();
  return COIN_ID_MAP[cleanTicker] || null;
}

// ============================================================================
// API CALLS
// ============================================================================

interface CoinGeckoHistoryResponse {
  id: string;
  symbol: string;
  name: string;
  market_data?: {
    current_price?: {
      usd?: number;
    };
  };
}

interface CoinGeckoSimplePriceResponse {
  [coinId: string]: {
    usd?: number;
  };
}

/**
 * Format date for CoinGecko API (DD-MM-YYYY)
 */
function formatDateForApi(timestamp: string): string {
  const date = new Date(timestamp);
  const day = date.getUTCDate().toString().padStart(2, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Get historical price for a coin at a specific date
 *
 * Uses market_chart/range endpoint which is available on free tier.
 * Falls back to current price if historical data unavailable.
 *
 * @param coinId - CoinGecko coin ID (e.g., "bitcoin", "ethereum")
 * @param timestamp - ISO timestamp or date string
 * @returns Price in USD or null if not found
 */
export async function getHistoricalPrice(
  coinId: string,
  timestamp: string
): Promise<number | null> {
  try {
    const targetDate = new Date(timestamp);
    const targetTime = Math.floor(targetDate.getTime() / 1000);

    // Use range from target date to target date + 1 day
    const fromTime = targetTime;
    const toTime = targetTime + 86400; // +1 day

    const url = `${COINGECKO_API}/coins/${coinId}/market_chart/range?vs_currency=usd&from=${fromTime}&to=${toTime}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error("[coingecko] Rate limited. Wait before retrying.");
      } else if (response.status === 401) {
        // API may require auth for historical - fall back to current price
        console.warn("[coingecko] Historical API requires auth, falling back to current price");
        return getCurrentPrice(coinId);
      } else {
        console.error(`[coingecko] API error: ${response.status}`);
      }
      return null;
    }

    const data = await response.json();

    // prices is array of [timestamp, price] pairs
    if (data.prices && data.prices.length > 0) {
      // Return the first price in the range
      return data.prices[0][1];
    }

    // Fall back to current price if no historical data
    console.warn("[coingecko] No historical data, using current price");
    return getCurrentPrice(coinId);
  } catch (e) {
    console.error("[coingecko] getHistoricalPrice error:", e);
    // Fall back to current price on error
    return getCurrentPrice(coinId);
  }
}

/**
 * Get historical price by ticker symbol
 *
 * @param ticker - Ticker symbol (e.g., "BTC", "ETH", "ETH:1")
 * @param timestamp - ISO timestamp or date string
 * @returns Price in USD or null if not found
 */
export async function getHistoricalPriceByTicker(
  ticker: string,
  timestamp: string
): Promise<number | null> {
  const coinId = getCoinGeckoId(ticker);
  if (!coinId) {
    console.warn(`[coingecko] Unknown ticker: ${ticker}`);
    return null;
  }
  return getHistoricalPrice(coinId, timestamp);
}

/**
 * Get current price for a coin
 *
 * @param coinId - CoinGecko coin ID
 * @returns Price in USD or null if not found
 */
export async function getCurrentPrice(coinId: string): Promise<number | null> {
  try {
    const url = `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`[coingecko] API error: ${response.status}`);
      return null;
    }

    const data: CoinGeckoSimplePriceResponse = await response.json();
    return data[coinId]?.usd || null;
  } catch (e) {
    console.error("[coingecko] getCurrentPrice error:", e);
    return null;
  }
}

/**
 * Get current prices for multiple coins
 *
 * @param coinIds - Array of CoinGecko coin IDs
 * @returns Map of coin ID to price
 */
export async function getCurrentPrices(
  coinIds: string[]
): Promise<Record<string, number>> {
  try {
    const ids = coinIds.join(",");
    const url = `${COINGECKO_API}/simple/price?ids=${ids}&vs_currencies=usd`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`[coingecko] API error: ${response.status}`);
      return {};
    }

    const data: CoinGeckoSimplePriceResponse = await response.json();
    const result: Record<string, number> = {};

    for (const [coinId, priceData] of Object.entries(data)) {
      if (priceData.usd !== undefined) {
        result[coinId] = priceData.usd;
      }
    }

    return result;
  } catch (e) {
    console.error("[coingecko] getCurrentPrices error:", e);
    return {};
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { COIN_ID_MAP };

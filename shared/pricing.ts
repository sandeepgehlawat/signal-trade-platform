/**
 * Signal Trade - Trade Pricing Utilities
 *
 * Handles price validation, normalization, and historical lookups
 */

// ============================================================================
// VALIDATION
// ============================================================================

export function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(num) ? num : null;
}

export function toPositivePrice(value: number | string | null | undefined): number | null {
  const num = toFiniteNumber(value);
  return num !== null && num > 0 ? num : null;
}

// ============================================================================
// TIMESTAMP HANDLING
// ============================================================================

/**
 * LLM agents sometimes pass "now" as a timestamp sentinel
 * This converts it to actual ISO timestamp
 */
export function resolveNowSentinel(value: string | undefined): string {
  if (!value || value.toLowerCase() === "now") {
    return new Date().toISOString();
  }
  return value;
}

/**
 * Parse various date formats into ISO timestamp
 */
export function parseTimestamp(value: string): string | null {
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

// ============================================================================
// PRICE NORMALIZATION
// ============================================================================

export interface TradePricing {
  author_price: number | null;
  posted_price: number | null;
}

/**
 * Normalize trade pricing data
 * Ensures both prices are valid positive numbers or null
 */
export function canonicalizeTradePricing(input: {
  author_price?: number | string | null;
  posted_price?: number | string | null;
}): TradePricing {
  return {
    author_price: toPositivePrice(input.author_price),
    posted_price: toPositivePrice(input.posted_price),
  };
}

// ============================================================================
// POLYMARKET PRICE NORMALIZATION
// ============================================================================

/**
 * Polymarket prices are 0-1 probabilities
 * Convert to held-side price based on direction
 */
export function normalizePolymarketPrice(
  yesPrice: number,
  direction: "yes" | "no"
): number {
  if (direction === "yes") {
    return yesPrice;
  }
  return 1 - yesPrice;
}

/**
 * Validate Polymarket price is in valid range
 */
export function isValidPolymarketPrice(price: number): boolean {
  return price >= 0 && price <= 1;
}

// ============================================================================
// PRICE COMPARISON
// ============================================================================

/**
 * Compare two prices with tolerance
 */
export function pricesRoughlyEqual(
  a: number | null,
  b: number | null,
  tolerance = 0.01
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  const maxVal = Math.max(Math.abs(a), Math.abs(b));
  if (maxVal === 0) return true;
  return Math.abs(a - b) / maxVal < tolerance;
}

/**
 * Calculate percentage change between two prices
 */
export function priceChangePct(oldPrice: number, newPrice: number): number {
  if (oldPrice === 0) return 0;
  return ((newPrice - oldPrice) / oldPrice) * 100;
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format price for display
 */
export function formatPrice(
  price: number | null,
  options: {
    decimals?: number;
    prefix?: string;
    suffix?: string;
  } = {}
): string {
  if (price === null) return "--";

  const { decimals = 2, prefix = "", suffix = "" } = options;

  // Handle very large numbers
  if (Math.abs(price) >= 1_000_000) {
    return `${prefix}${(price / 1_000_000).toFixed(1)}M${suffix}`;
  }
  if (Math.abs(price) >= 1_000) {
    return `${prefix}${(price / 1_000).toFixed(1)}K${suffix}`;
  }

  return `${prefix}${price.toFixed(decimals)}${suffix}`;
}

/**
 * Format USD price
 */
export function formatUsd(price: number | null): string {
  return formatPrice(price, { prefix: "$", decimals: 2 });
}

/**
 * Format crypto price (more decimals for small values)
 */
export function formatCryptoPrice(price: number | null): string {
  if (price === null) return "--";

  if (price < 0.01) {
    return `$${price.toFixed(6)}`;
  }
  if (price < 1) {
    return `$${price.toFixed(4)}`;
  }
  return formatUsd(price);
}

/**
 * Signal Trade - P&L Calculation
 *
 * Tracks performance from two perspectives:
 * - Author P&L: from the price when thesis was published
 * - Posted P&L: from the price when posted to Signal Trade
 */

import type { Direction, Platform, PnlResult } from "../types";
import { toFiniteNumber, toPositivePrice, pricesRoughlyEqual } from "./pricing";

// Re-export for backwards compatibility
export { toFiniteNumber, toPositivePrice, pricesRoughlyEqual };

// ============================================================================
// PLATFORM DETECTION
// ============================================================================

export function isPolymarketTrade(platform: Platform): boolean {
  return platform === "polymarket";
}

export function isHyperliquidPerp(platform: Platform, instrumentType: string): boolean {
  return platform === "hyperliquid" && instrumentType === "perp";
}

// ============================================================================
// P&L CALCULATION
// ============================================================================

/**
 * Core P&L calculation
 *
 * For prediction markets: simple percentage change
 * For perps/equities: accounts for direction (shorts profit when price falls)
 *
 * @param basePrice - Entry price (author or posted)
 * @param currentPrice - Current market price
 * @param direction - Trade direction (long/short/yes/no)
 * @param platform - Trading platform
 */
export function computePnlPct(
  basePrice: number,
  currentPrice: number,
  direction: Direction,
  platform: Platform
): number {
  if (basePrice <= 0) return 0;

  if (isPolymarketTrade(platform)) {
    // Polymarket: held-side price change
    // If YES at $0.60 and now $0.80 = +33.3%
    // If NO at $0.40 and now $0.20 = -50%
    return ((currentPrice - basePrice) / basePrice) * 100;
  }

  // Stocks/Crypto perps
  const priceChange = ((currentPrice - basePrice) / basePrice) * 100;

  // Long profits when price rises, short profits when price falls
  if (direction === "short" || direction === "no") {
    return -priceChange;
  }

  return priceChange;
}

/**
 * Author P&L: measures how the original thesis performed
 */
export function computeAuthorPnl(
  authorPrice: number | null,
  currentPrice: number | null,
  direction: Direction,
  platform: Platform
): number | null {
  const base = toPositivePrice(authorPrice);
  const current = toPositivePrice(currentPrice);

  if (base === null || current === null) return null;

  return computePnlPct(base, current, direction, platform);
}

/**
 * Posted P&L: measures performance since posting to Signal Trade
 */
export function computePostedPnl(
  postedPrice: number | null,
  currentPrice: number | null,
  direction: Direction,
  platform: Platform
): number | null {
  const base = toPositivePrice(postedPrice);
  const current = toPositivePrice(currentPrice);

  if (base === null || current === null) return null;

  return computePnlPct(base, current, direction, platform);
}

/**
 * Full P&L result with both lenses
 */
export function computeFullPnl(
  authorPrice: number | null,
  postedPrice: number | null,
  currentPrice: number | null,
  direction: Direction,
  platform: Platform
): PnlResult {
  const current = toPositivePrice(currentPrice);
  const author = toPositivePrice(authorPrice);
  const posted = toPositivePrice(postedPrice);

  return {
    author_pnl_pct: author && current
      ? computePnlPct(author, current, direction, platform)
      : null,
    posted_pnl_pct: posted && current
      ? computePnlPct(posted, current, direction, platform)
      : null,
    current_price: current || 0,
    movement_since_publish: author && current
      ? ((current - author) / author) * 100
      : 0,
  };
}

// ============================================================================
// FORMATTING
// ============================================================================

export function formatPnlPct(pnl: number | null): string {
  if (pnl === null) return "--";

  // Handle extreme values
  if (Math.abs(pnl) >= 10000) {
    return `${(pnl / 1000).toFixed(1)}K%`;
  }

  // Standard formatting
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}${pnl.toFixed(2)}%`;
}

export function formatPrice(price: number | null, decimals = 2): string {
  if (price === null) return "--";
  return price.toFixed(decimals);
}

/**
 * Apply leverage multiplier to P&L
 */
export function applyLeverage(
  pnl: number | null,
  leverage: number
): number | null {
  if (pnl === null || leverage <= 0) return pnl;
  return pnl * leverage;
}

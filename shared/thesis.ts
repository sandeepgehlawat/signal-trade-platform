/**
 * Signal Trade - Thesis Extraction
 *
 * Centralized thesis extraction logic - single source of truth
 * Used by both CLI (trade.ts) and API (server.ts)
 *
 * This is keyword-based extraction. In production, replace with Claude API call.
 */

import type { ExtractedSource, Thesis, ThesisDirection } from "../types";

// ============================================================================
// PATTERNS
// ============================================================================

const BULLISH_PATTERNS = [
  // Direct sentiment
  /\b(?:bullish|long|buy|calls?|upside|going up|moon|pump|accumulate|load(?:ing)?)\b/gi,
  // Price predictions
  /\b(?:will\s+(?:go|rise|increase|rally|surge|explode|rip))/gi,
  /\b(?:price target|pt)\s*(?:of\s*)?\$?[\d,]+/gi,
  /\b(?:ATH|all.time.high|breakout|reversal)/gi,
  // Confidence
  /\b(?:undervalued|cheap|discount|opportunity|buy the dip|btfd)\b/gi,
];

const BEARISH_PATTERNS = [
  // Direct sentiment
  /\b(?:bearish|short|sell|puts?|downside|going down|dump|crash|avoid|exit)\b/gi,
  // Price predictions
  /\b(?:will\s+(?:fall|drop|decrease|decline|tank|collapse|dump))/gi,
  /\b(?:warning|caution|overvalued|bubble|top\s+is\s+in)\b/gi,
  // Risk signals
  /\b(?:risk|danger|red flag|ponzi|scam|rug)\b/gi,
];

// Asset patterns - case insensitive, no global flag to avoid state issues
const ASSET_PATTERNS: Record<string, { pattern: RegExp; aliases: string[] }> = {
  BTC: { pattern: /\b(?:bitcoin|btc|\$btc|₿)\b/i, aliases: ["bitcoin"] },
  ETH: { pattern: /\b(?:ethereum|eth|\$eth|ether)\b/i, aliases: ["ethereum"] },
  SOL: { pattern: /\b(?:solana|sol|\$sol)\b/i, aliases: ["solana"] },
  ARB: { pattern: /\b(?:arbitrum|arb|\$arb)\b/i, aliases: ["arbitrum"] },
  OP: { pattern: /\b(?:optimism|op|\$op)\b/i, aliases: ["optimism"] },
  AVAX: { pattern: /\b(?:avalanche|avax|\$avax)\b/i, aliases: ["avalanche"] },
  MATIC: { pattern: /\b(?:polygon|matic|\$matic)\b/i, aliases: ["polygon"] },
  LINK: { pattern: /\b(?:chainlink|link|\$link)\b/i, aliases: ["chainlink"] },
  UNI: { pattern: /\b(?:uniswap|uni|\$uni)\b/i, aliases: ["uniswap"] },
  AAVE: { pattern: /\b(?:aave|\$aave)\b/i, aliases: ["aave"] },
  DOGE: { pattern: /\b(?:dogecoin|doge|\$doge)\b/i, aliases: ["dogecoin"] },
  SHIB: { pattern: /\b(?:shiba|shib|\$shib)\b/i, aliases: ["shiba"] },
  PEPE: { pattern: /\b(?:pepe|\$pepe)\b/i, aliases: ["pepe"] },
  WIF: { pattern: /\b(?:dogwifhat|wif|\$wif)\b/i, aliases: ["dogwifhat"] },
  XRP: { pattern: /\b(?:ripple|xrp|\$xrp)\b/i, aliases: ["ripple"] },
  ADA: { pattern: /\b(?:cardano|ada|\$ada)\b/i, aliases: ["cardano"] },
  DOT: { pattern: /\b(?:polkadot|dot|\$dot)\b/i, aliases: ["polkadot"] },
  ATOM: { pattern: /\b(?:cosmos|atom|\$atom)\b/i, aliases: ["cosmos"] },
  NEAR: { pattern: /\b(?:near|\$near)\b/i, aliases: ["near"] },
  APT: { pattern: /\b(?:aptos|apt|\$apt)\b/i, aliases: ["aptos"] },
  SUI: { pattern: /\b(?:sui|\$sui)\b/i, aliases: ["sui"] },
};

// Time horizon patterns
const HORIZON_PATTERNS: Record<string, RegExp> = {
  intraday: /\b(?:today|intraday|this session|next few hours?)\b/i,
  short: /\b(?:this week|short.term|few days?|1-2 weeks?)\b/i,
  medium: /\b(?:this month|medium.term|few weeks?|1-3 months?)\b/i,
  long: /\b(?:this year|long.term|years?|hold|hodl)\b/i,
};

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extract mentioned assets from text
 */
function extractAssets(text: string): string[] {
  const found: string[] = [];

  for (const [ticker, { pattern }] of Object.entries(ASSET_PATTERNS)) {
    if (pattern.test(text)) {
      found.push(ticker);
    }
  }

  return found;
}

/**
 * Calculate sentiment scores
 */
function calculateSentiment(text: string): {
  bullishScore: number;
  bearishScore: number;
  direction: ThesisDirection;
} {
  let bullishScore = 0;
  let bearishScore = 0;

  for (const pattern of BULLISH_PATTERNS) {
    const matches = text.match(pattern) || [];
    bullishScore += matches.length;
  }

  for (const pattern of BEARISH_PATTERNS) {
    const matches = text.match(pattern) || [];
    bearishScore += matches.length;
  }

  const direction: ThesisDirection =
    bullishScore > bearishScore
      ? "bullish"
      : bearishScore > bullishScore
        ? "bearish"
        : "neutral";

  return { bullishScore, bearishScore, direction };
}

/**
 * Extract time horizon from text
 */
function extractHorizon(text: string): string | undefined {
  for (const [horizon, pattern] of Object.entries(HORIZON_PATTERNS)) {
    if (pattern.test(text)) {
      return horizon;
    }
  }
  return undefined;
}

/**
 * Find relevant quote for an asset
 */
function findRelevantQuote(text: string, asset: string): string | undefined {
  const sentences = text.split(/[.!?]+/);
  const pattern = ASSET_PATTERNS[asset]?.pattern;

  if (!pattern) return undefined;

  for (const sentence of sentences) {
    if (pattern.test(sentence) && sentence.trim().length > 20) {
      return sentence.trim().slice(0, 200);
    }
  }

  return undefined;
}

/**
 * Calculate confidence based on signal strength
 */
function calculateConfidence(
  bullishScore: number,
  bearishScore: number,
  textLength: number
): number {
  const totalSignals = bullishScore + bearishScore;

  if (totalSignals === 0) return 0.3;

  // More signals = higher confidence (up to a point)
  const signalStrength = Math.min(totalSignals / 5, 1);

  // Clearer direction = higher confidence
  const directionClarity =
    Math.abs(bullishScore - bearishScore) / Math.max(totalSignals, 1);

  // Longer text with signals = more confidence
  const textFactor = Math.min(textLength / 500, 1);

  const confidence = 0.4 + signalStrength * 0.3 + directionClarity * 0.2 + textFactor * 0.1;

  return Math.min(Math.max(confidence, 0.3), 0.95);
}

// ============================================================================
// MAIN EXTRACTOR
// ============================================================================

/**
 * Extract trading theses from source content
 *
 * @param source - Extracted source content
 * @param runId - Optional run ID for tracking
 * @returns Array of theses (may be empty if no tradeable signals found)
 */
export function extractTheses(source: ExtractedSource, runId?: string): Thesis[] {
  const text = source.text || source.transcript || "";

  if (text.length < 10) {
    return [];
  }

  // Extract components
  const assets = extractAssets(text);
  const { bullishScore, bearishScore, direction } = calculateSentiment(text);
  const horizon = extractHorizon(text);

  // No clear direction = no trades
  if (direction === "neutral") {
    return [];
  }

  const theses: Thesis[] = [];
  const baseConfidence = calculateConfidence(bullishScore, bearishScore, text.length);

  // Create thesis for each mentioned asset
  if (assets.length > 0) {
    for (const asset of assets.slice(0, 3)) {
      // Max 3 theses per source
      const quote = findRelevantQuote(text, asset);

      const thesis: Thesis = {
        id: `thesis_${Date.now()}_${asset}`,
        thesis_text: `${direction.charAt(0).toUpperCase() + direction.slice(1)} on ${asset}`,
        direction,
        confidence: baseConfidence,
        time_horizon: horizon,
        supporting_quotes: quote
          ? [{ text: quote, attribution: source.author }]
          : [],
        keywords: [asset, ...ASSET_PATTERNS[asset].aliases],
        status: "saved",
        created_at: new Date().toISOString(),
        run_id: runId,
      };

      theses.push(thesis);
    }
  } else {
    // General market thesis if no specific assets
    theses.push({
      id: `thesis_${Date.now()}_general`,
      thesis_text: `${direction.charAt(0).toUpperCase() + direction.slice(1)} market outlook`,
      direction,
      confidence: baseConfidence * 0.8, // Lower confidence for general thesis
      time_horizon: horizon,
      supporting_quotes: [],
      keywords: ["market", "crypto"],
      status: "saved",
      created_at: new Date().toISOString(),
      run_id: runId,
    });
  }

  return theses;
}

/**
 * Extract theses from raw text (convenience wrapper)
 */
export function extractThesesFromText(
  text: string,
  author?: string,
  runId?: string
): Thesis[] {
  return extractTheses(
    {
      url: "",
      source_type: "text",
      text,
      author,
      word_count: text.split(/\s+/).length,
    },
    runId
  );
}

export default extractTheses;

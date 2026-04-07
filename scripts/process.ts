#!/usr/bin/env bun
/**
 * Signal Trade - LLM-Assisted Processing
 *
 * This script is designed to be called by an LLM (Claude Code, Codex, etc.)
 * with pre-analyzed thesis data.
 *
 * Usage:
 *   bun run process.ts extract <url-or-text>     Extract content only
 *   bun run process.ts thesis <thesis_json>      Route a thesis to instruments
 *   bun run process.ts trade <trade_json>        Save a complete trade
 *   bun run process.ts full <url-or-text>        Full pipeline (keyword extraction)
 */

import type { Thesis, TradePost, RouteEvidence, ExtractedSource } from "../types";
import { extract } from "./extract";
import { route } from "./route";
import { saveTrade } from "../shared/storage";
import { extractTheses } from "../shared/thesis";

// ============================================================================
// EXTRACT COMMAND
// ============================================================================

async function handleExtract(input: string): Promise<void> {
  const result = await extract(input);

  if (!result.success) {
    console.error(JSON.stringify({ error: result.error }));
    process.exit(1);
  }

  // Output extracted content for LLM to analyze
  console.log(JSON.stringify({
    success: true,
    source: {
      url: result.source!.url,
      source_type: result.source!.source_type,
      title: result.source!.title,
      author: result.source!.author,
      author_handle: result.source!.author_handle,
      author_avatar: result.source!.author_avatar,
      publish_date: result.source!.publish_date,
      word_count: result.source!.word_count,
      text: result.source!.text,
      transcript: result.source!.transcript,
    },
    // Also provide keyword-based suggestions as hints
    suggested_theses: extractTheses(result.source!).map(t => ({
      direction: t.direction,
      keywords: t.keywords,
      confidence: t.confidence,
      thesis_text: t.thesis_text,
    })),
  }, null, 2));
}

// ============================================================================
// THESIS COMMAND
// ============================================================================

async function handleThesis(thesisJson: string): Promise<void> {
  let thesis: Thesis;

  try {
    thesis = JSON.parse(thesisJson);
  } catch (e) {
    console.error(JSON.stringify({ error: "Invalid thesis JSON" }));
    process.exit(1);
  }

  // Validate required fields
  if (!thesis.direction || !thesis.thesis_text) {
    console.error(JSON.stringify({
      error: "Thesis must have direction and thesis_text",
      required: {
        direction: "bullish | bearish | neutral",
        thesis_text: "Human-readable thesis statement",
        keywords: ["ASSET"],
        confidence: 0.8,
      },
    }));
    process.exit(1);
  }

  // Ensure thesis has an ID
  if (!thesis.id) {
    const asset = thesis.keywords?.[0] || "general";
    thesis.id = `thesis_${Date.now()}_${asset}`;
  }

  // Set defaults
  thesis.status = thesis.status || "saved";
  thesis.created_at = thesis.created_at || new Date().toISOString();
  thesis.supporting_quotes = thesis.supporting_quotes || [];

  // Route the thesis
  const routeEvidence = await route(thesis);

  if (!routeEvidence) {
    console.error(JSON.stringify({
      error: "No suitable instrument found for thesis",
      thesis: thesis.thesis_text,
      keywords: thesis.keywords,
    }));
    process.exit(1);
  }

  console.log(JSON.stringify({
    success: true,
    thesis_id: thesis.id,
    route: {
      ticker: routeEvidence.routed_ticker,
      platform: routeEvidence.platform,
      direction: routeEvidence.direction,
      trade_type: routeEvidence.trade_type,
      posted_price: routeEvidence.posted_price,
      derivation: routeEvidence.derivation,
    },
  }, null, 2));
}

// ============================================================================
// TRADE COMMAND
// ============================================================================

async function handleTrade(tradeJson: string): Promise<void> {
  let trade: TradePost;

  try {
    trade = JSON.parse(tradeJson);
  } catch (e) {
    console.error(JSON.stringify({ error: "Invalid trade JSON" }));
    process.exit(1);
  }

  // Validate required fields
  const required = ["ticker", "direction", "platform", "headline_quote"];
  const missing = required.filter((f) => !trade[f as keyof TradePost]);

  if (missing.length > 0) {
    console.error(JSON.stringify({
      error: `Missing required fields: ${missing.join(", ")}`,
      required: {
        ticker: "ETH",
        direction: "long | short | yes | no",
        platform: "hyperliquid | polymarket | okx",
        headline_quote: "The key quote from source",
        posted_price: 2100.50,
        author: "Author name",
        source_url: "https://...",
      },
    }));
    process.exit(1);
  }

  // Set defaults
  trade.id = trade.id || `trade_${Date.now()}`;
  trade.thesis_id = trade.thesis_id || `thesis_${Date.now()}`;
  trade.instrument_type = trade.instrument_type || "perp";
  trade.trade_type = trade.trade_type || "direct";
  trade.author_price = trade.author_price || 0;
  trade.posted_price = trade.posted_price || 0;
  trade.author = trade.author || "Unknown";
  trade.source_url = trade.source_url || "";
  trade.source_date = trade.source_date || new Date().toISOString();
  trade.posted_at = trade.posted_at || new Date().toISOString();
  trade.derivation = trade.derivation || {
    headline_quote: trade.headline_quote,
    explanation: `${trade.direction} ${trade.ticker} on ${trade.platform}`,
    steps: [
      { step_number: 1, text: trade.headline_quote.slice(0, 70) },
    ],
  };

  // Save trade
  try {
    saveTrade(trade);
    console.log(JSON.stringify({
      success: true,
      trade_id: trade.id,
      ticker: trade.ticker,
      platform: trade.platform,
      direction: trade.direction,
      posted_price: trade.posted_price,
    }, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ error: `Failed to save trade: ${e}` }));
    process.exit(1);
  }
}

// ============================================================================
// FULL COMMAND (keyword-based fallback)
// ============================================================================

async function handleFull(input: string): Promise<void> {
  // This runs the full pipeline with keyword-based extraction
  // Use this as a fallback when LLM analysis isn't available

  const extractResult = await extract(input);

  if (!extractResult.success || !extractResult.source) {
    console.error(JSON.stringify({ error: extractResult.error }));
    process.exit(1);
  }

  const source = extractResult.source;
  const theses = extractTheses(source);

  if (theses.length === 0) {
    console.log(JSON.stringify({
      success: true,
      source: {
        title: source.title,
        author: source.author,
        type: source.source_type,
      },
      theses: [],
      trades: [],
      message: "No tradeable signals found (keyword-based extraction)",
    }, null, 2));
    return;
  }

  const trades: TradePost[] = [];

  for (const thesis of theses) {
    const routeEvidence = await route(thesis);
    if (!routeEvidence) continue;

    const trade: TradePost = {
      id: `trade_${Date.now()}`,
      thesis_id: thesis.id,
      ticker: routeEvidence.routed_ticker,
      direction: routeEvidence.direction,
      platform: routeEvidence.platform,
      instrument_type: routeEvidence.instrument_type,
      trade_type: routeEvidence.trade_type,
      headline_quote: routeEvidence.derivation.headline_quote,
      author_price: routeEvidence.author_price || 0,
      posted_price: routeEvidence.posted_price || 0,
      author: source.author || "Unknown",
      author_handle: source.author_handle,
      author_avatar: source.author_avatar,
      source_url: source.url,
      source_date: source.publish_date || new Date().toISOString(),
      derivation: routeEvidence.derivation,
      posted_at: new Date().toISOString(),
    };

    saveTrade(trade);
    trades.push(trade);
  }

  console.log(JSON.stringify({
    success: true,
    source: {
      title: source.title,
      author: source.author,
      type: source.source_type,
      publish_date: source.publish_date,
    },
    theses: theses.map((t) => ({
      id: t.id,
      direction: t.direction,
      thesis_text: t.thesis_text,
      confidence: t.confidence,
      keywords: t.keywords,
    })),
    trades: trades.map((t) => ({
      id: t.id,
      ticker: t.ticker,
      platform: t.platform,
      direction: t.direction,
      posted_price: t.posted_price,
    })),
  }, null, 2));
}

// ============================================================================
// CLI
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Signal Trade - LLM-Assisted Processing

Usage:
  bun run process.ts extract <url-or-text>     Extract content for LLM analysis
  bun run process.ts thesis '<thesis_json>'    Route an LLM-created thesis
  bun run process.ts trade '<trade_json>'      Save a complete trade
  bun run process.ts full <url-or-text>        Full pipeline (keyword fallback)

Workflow for LLM:
  1. Run 'extract' to get content
  2. Analyze content and create thesis JSON
  3. Run 'thesis' to route and get instrument
  4. Run 'trade' to save final trade

Example thesis JSON:
  {
    "direction": "bullish",
    "thesis_text": "Bullish on ETH",
    "keywords": ["ETH"],
    "confidence": 0.8,
    "supporting_quotes": [{"text": "accumulating here"}]
  }
`);
    process.exit(0);
  }

  const command = args[0];
  const input = args.slice(1).join(" ");

  switch (command) {
    case "extract":
      await handleExtract(input);
      break;
    case "thesis":
      await handleThesis(input);
      break;
    case "trade":
      await handleTrade(input);
      break;
    case "full":
      await handleFull(input);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ error: String(e) }));
  process.exit(1);
});

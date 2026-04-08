---
user-invocable: true
allowed-tools: Bash, Read, Write, Glob, Grep, WebFetch, WebSearch
description: Extract trading signals from URLs or text and route to executable instruments (Hyperliquid, Polymarket, OKX). Use for processing tweets, YouTube videos, or text with trading theses.
---

# Signal Trade Skill

Extract trading signals from any content source and route to executable instruments.

## Trigger
`/signal-trade <url-or-text>`

## Workflow

### Step 1: Extract Content

If input is a URL, extract content:
```bash
cd ~/signal-trade-platform && ~/.bun/bin/bun run scripts/extract.ts "<input>"
```

Supported sources:
- YouTube videos (requires yt-dlp)
- Twitter/X posts
- Articles/blog posts
- PDF documents
- Raw text

### Step 2: Deep Context Analysis

**YOU (Claude) must perform thorough analysis before extracting any thesis.**

#### 2.1 Content Understanding
First, understand what the content is actually saying:
- What is the author's CURRENT position? (not future plans)
- What specific assets are mentioned?
- What is the author's track record/credibility?
- Is this original analysis or commentary on news?

#### 2.2 Identify Statements vs Conditionals

**CRITICAL: Distinguish between these statement types:**

| Type | Example | Action |
|------|---------|--------|
| **Current Position** | "I'm long ETH here" | ✅ Extract thesis |
| **Unconditional View** | "BTC looks bullish" | ✅ Extract thesis |
| **Conditional Future** | "IF it breaks 70k, THEN bullish" | ❌ Skip - no current thesis |
| **Waiting Entry** | "Looking to buy on a pullback" | ❌ Skip - not positioned |
| **Both Directions** | "Above X bullish, below Y bearish" | ❌ Skip - ambiguous |

#### 2.3 Counter-Argument Brainstorming

Before finalizing any thesis, brainstorm counter-arguments:

1. **What could invalidate this thesis?**
   - Key levels that would flip the view
   - Time decay on the thesis
   - Macro factors that could override

2. **Is the information already priced in?**
   - How old is the content?
   - Was this news widely reported?
   - Check if price already moved

3. **What's the author NOT saying?**
   - Are they hedging somewhere?
   - Do they have conflicting positions?
   - What risks are they ignoring?

#### 2.4 Confidence Calibration

**Confidence scoring rules:**

| Confidence | Criteria |
|------------|----------|
| **0.85-0.95** | Clear position + specific entry + defined target/stop + reasoning |
| **0.70-0.84** | Clear direction + some reasoning, but vague on levels |
| **0.50-0.69** | Sentiment expressed but hedged or conditional |
| **< 0.50** | Do not extract - too uncertain |

**Confidence penalties:**
- -0.1 if author has mixed signals in same content
- -0.1 if content is > 4 hours old
- -0.1 if no specific levels mentioned
- -0.15 if thesis contradicts recent price action
- -0.2 if author says "maybe", "possibly", "might"

### Step 3: Thesis Extraction

Only after completing Step 2, extract thesis if warranted.

For each valid thesis, determine:
1. **Direction**: bullish | bearish (NOT neutral - skip neutral)
2. **Asset(s)**: BTC, ETH, SOL, etc.
3. **Confidence**: 0.5 - 0.95 (use calibration above)
4. **Time Horizon**: intraday | short | medium | long
5. **Supporting Quote**: Direct quote showing the view
6. **Counter-Arguments**: List 2-3 risks

**Hard Skip Rules (do NOT extract thesis):**
- Conditional statements ("if X then Y")
- Author is "watching" or "waiting" (no position)
- Multiple conflicting directions in same content
- Pure news without opinion
- Confidence would be < 0.5
- Content > 24 hours old without fresh context

### Step 4: Route to Instruments

For each valid thesis, run:
```bash
cd ~/signal-trade-platform && ~/.bun/bin/bun run scripts/route.ts '<thesis_json>'
```

thesis_json format:
```json
{
  "id": "thesis_<timestamp>_<asset>",
  "thesis_text": "Bullish on ETH",
  "direction": "bullish",
  "confidence": 0.75,
  "keywords": ["ETH"],
  "supporting_quotes": [{"text": "quote here", "attribution": "author"}],
  "status": "saved",
  "created_at": "<iso_timestamp>"
}
```

### Step 5: Save Trade

If routing succeeds, save the trade:
```bash
cd ~/signal-trade-platform && ~/.bun/bin/bun run scripts/post.ts '<trade_json>'
```

### Step 6: Report Results

Display to user:
- **Source**: Author, date, type
- **Analysis Summary**: Your understanding of the content
- **Extracted Thesis**: Direction, asset, confidence
- **Counter-Arguments**: Risks identified
- **Routed Instrument**: Platform, ticker, entry price
- **Trade ID**: For tracking

## Examples

### Example 1: Clear Signal (EXTRACT)

**Content**: "@trader: Just went long ETH at 2200. Target 2500, stop at 2100."

**Analysis**:
- Current position: Long ETH (confirmed entry)
- Specific levels: Entry 2200, target 2500, stop 2100
- No hedging or conditionals
- Counter-arguments: If BTC dumps, ETH follows; 2100 stop is tight

**Thesis**: Bullish ETH, confidence 0.85

### Example 2: Conditional (SKIP)

**Content**: "@trader: BTC above 70k we go long, below 68k we short. Currently 69k."

**Analysis**:
- Current position: NONE (waiting for trigger)
- Both directions conditional
- No actionable thesis now

**Result**: SKIP - no current thesis

### Example 3: Hedged View (LOW CONFIDENCE)

**Content**: "@trader: ETH looks decent here, might add some. Not sure about macro though."

**Analysis**:
- Current position: Maybe adding (not committed)
- "might", "not sure" = high uncertainty
- No specific levels

**Thesis**: Bullish ETH, confidence 0.55 (borderline - consider skipping)

### Example 4: Mixed Signals (SKIP)

**Content**: "@trader: Long term bullish on SOL but short term could see 80 before 100."

**Analysis**:
- Conflicting timeframes
- Bearish short-term, bullish long-term
- Cannot extract clear direction

**Result**: SKIP - mixed signals

## Commands

| Command | Description |
|---------|-------------|
| `/signal-trade <url>` | Process URL, extract signals |
| `/signal-trade "<text>"` | Process raw text |
| `/signal-trade update` | Update P&L for open trades |
| `/signal-trade status` | Show all open trades |

## Venue Routing Logic

| Thesis Type | Preferred Venue | Reason |
|-------------|-----------------|--------|
| Crypto price direction | Hyperliquid perp | Direct exposure, leverage |
| Event/catalyst | Polymarket | Binary outcome, defined resolution |
| Altcoin spot | OKX DEX | Multi-chain access |

## Notes

- Trades are saved to SQLite at `~/signal-trade-platform/signal-trade.db`
- Dashboard available at http://localhost:3460 (run `bun run serve`)
- P&L tracks both author price (at publish) and posted price (at entry)
- **Quality over quantity** - it's better to skip uncertain signals than create bad trades

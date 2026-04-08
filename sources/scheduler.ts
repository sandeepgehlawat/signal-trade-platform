#!/usr/bin/env bun
/**
 * Signal Trade - Source Monitor Scheduler
 *
 * Automated polling of Twitter, YouTube, and RSS sources
 * Processes new content through the signal extraction pipeline
 */

import { POLLING_CONFIG, getAllSources } from "./config";
import { checkTwitterSources, type Tweet } from "./twitter";
import { checkYouTubeSources, type YouTubeVideo } from "./youtube";
import { checkRSSSources, type RSSItem } from "./rss";
import { markAsSignalGenerated, getRecentContent } from "./storage";

// API server URL for processing
const API_URL = process.env.API_URL || "http://localhost:3460";

// ============================================================================
// SIGNAL PROCESSING
// ============================================================================

/**
 * Process content through the signal extraction API
 */
async function processContent(url: string, contentDbId: string): Promise<boolean> {
  try {
    console.log(`[scheduler] Processing: ${url}`);

    const response = await fetch(`${API_URL}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: url }),
      signal: AbortSignal.timeout(60000), // 60 second timeout
    });

    if (!response.ok) {
      console.error(`[scheduler] Process failed: ${response.status}`);
      return false;
    }

    const data = await response.json();

    if (data.run_id) {
      // Signal extraction started successfully
      markAsSignalGenerated(contentDbId);
      console.log(`[scheduler] Started extraction: ${data.run_id}`);
      return true;
    }

    return false;
  } catch (e) {
    console.error(`[scheduler] Error processing ${url}:`, e);
    return false;
  }
}

/**
 * Process a batch of tweets
 */
async function processTweets(tweets: Tweet[]): Promise<void> {
  for (const tweet of tweets) {
    // Get the content DB record
    const content = getRecentContent(100).find(
      c => c.sourceType === "twitter" && c.contentId === tweet.id
    );

    if (content && !content.signalGenerated) {
      await processContent(tweet.url, content.id);
      // Small delay between API calls
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

/**
 * Process a batch of YouTube videos
 */
async function processVideos(videos: YouTubeVideo[]): Promise<void> {
  for (const video of videos) {
    const content = getRecentContent(100).find(
      c => c.sourceType === "youtube" && c.contentId === video.id
    );

    if (content && !content.signalGenerated) {
      await processContent(video.url, content.id);
      // Longer delay for YouTube (transcript extraction takes time)
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

/**
 * Process a batch of RSS items
 */
async function processRSSItems(items: RSSItem[]): Promise<void> {
  for (const item of items) {
    const content = getRecentContent(100).find(
      c => c.sourceType === "rss" && c.contentId === item.id
    );

    if (content && !content.signalGenerated) {
      await processContent(item.url, content.id);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ============================================================================
// SCHEDULER
// ============================================================================

let isRunning = false;
let twitterTimer: ReturnType<typeof setInterval> | null = null;
let youtubeTimer: ReturnType<typeof setInterval> | null = null;
let rssTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Run Twitter monitoring cycle
 */
async function runTwitterCycle(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const tweets = await checkTwitterSources();
    if (tweets.length > 0) {
      await processTweets(tweets);
    }
  } catch (e) {
    console.error("[scheduler] Twitter cycle error:", e);
  } finally {
    isRunning = false;
  }
}

/**
 * Run YouTube monitoring cycle
 */
async function runYouTubeCycle(): Promise<void> {
  try {
    const videos = await checkYouTubeSources();
    if (videos.length > 0) {
      await processVideos(videos);
    }
  } catch (e) {
    console.error("[scheduler] YouTube cycle error:", e);
  }
}

/**
 * Run RSS monitoring cycle
 */
async function runRSSCycle(): Promise<void> {
  try {
    const items = await checkRSSSources();
    if (items.length > 0) {
      await processRSSItems(items);
    }
  } catch (e) {
    console.error("[scheduler] RSS cycle error:", e);
  }
}

/**
 * Start all monitoring timers
 */
export function startMonitoring(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Signal Trade - Source Monitor                      ║
╠══════════════════════════════════════════════════════════════╣
║  Twitter:  Every ${POLLING_CONFIG.intervals.twitter / 60000} minutes                                ║
║  YouTube:  Every ${POLLING_CONFIG.intervals.youtube / 60000} minutes                               ║
║  RSS:      Every ${POLLING_CONFIG.intervals.rss / 60000} minutes                                ║
╠══════════════════════════════════════════════════════════════╣
║  Sources configured:                                         ║
${getAllSources().slice(0, 5).map(s => `║    - ${s.name.padEnd(50)}║`).join("\n")}
║    ... and ${Math.max(0, getAllSources().length - 5)} more                                        ║
╚══════════════════════════════════════════════════════════════╝
`);

  // Run initial checks immediately
  console.log("[scheduler] Running initial checks...");

  // Stagger the initial checks
  setTimeout(() => runTwitterCycle(), 1000);
  setTimeout(() => runYouTubeCycle(), 5000);
  setTimeout(() => runRSSCycle(), 10000);

  // Set up recurring timers
  twitterTimer = setInterval(runTwitterCycle, POLLING_CONFIG.intervals.twitter);
  youtubeTimer = setInterval(runYouTubeCycle, POLLING_CONFIG.intervals.youtube);
  rssTimer = setInterval(runRSSCycle, POLLING_CONFIG.intervals.rss);

  console.log("[scheduler] Monitoring started. Press Ctrl+C to stop.");
}

/**
 * Stop all monitoring
 */
export function stopMonitoring(): void {
  if (twitterTimer) clearInterval(twitterTimer);
  if (youtubeTimer) clearInterval(youtubeTimer);
  if (rssTimer) clearInterval(rssTimer);
  console.log("[scheduler] Monitoring stopped.");
}

/**
 * Run a single check cycle (for testing)
 */
export async function runOnce(): Promise<void> {
  console.log("[scheduler] Running single check cycle...");

  const [tweets, videos, items] = await Promise.all([
    checkTwitterSources(),
    checkYouTubeSources(),
    checkRSSSources(),
  ]);

  console.log(`[scheduler] Found: ${tweets.length} tweets, ${videos.length} videos, ${items.length} articles`);

  // Process all new content
  await processTweets(tweets);
  await processVideos(videos);
  await processRSSItems(items);

  console.log("[scheduler] Single cycle complete.");
}

// ============================================================================
// MAIN
// ============================================================================

// Run as standalone script
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.includes("--once")) {
    // Single run mode
    runOnce().then(() => process.exit(0));
  } else {
    // Continuous monitoring mode
    startMonitoring();

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      stopMonitoring();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      stopMonitoring();
      process.exit(0);
    });
  }
}

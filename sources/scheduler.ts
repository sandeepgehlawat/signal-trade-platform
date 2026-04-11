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

// Signal Trade skill API URL (sources queue)
// The skill runs on 3461, platform runs on 3460
const SKILL_API_URL = process.env.SKILL_API_URL || "http://localhost:3461";

// ============================================================================
// SOURCE QUEUE SUBMISSION
// ============================================================================

interface SourcePayload {
  source_type: "twitter" | "youtube" | "article" | "text";
  url: string;
  title?: string;
  author?: string;
  author_handle?: string;
  publish_date?: string;
  priority?: number;
}

/**
 * Add content to the sources queue for processing by Claude skill
 * The skill's monitor mode polls /sources/content and processes each item
 */
async function addToSourceQueue(payload: SourcePayload, contentDbId: string): Promise<boolean> {
  try {
    console.log(`[scheduler] Queueing: ${payload.url}`);

    const response = await fetch(`${SKILL_API_URL}/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      console.error(`[scheduler] Queue failed: ${response.status}`);
      return false;
    }

    const data = await response.json();

    if (data.source_id) {
      // Content added to queue successfully
      markAsSignalGenerated(contentDbId);
      console.log(`[scheduler] Queued: ${data.source_id}`);
      return true;
    }

    return false;
  } catch (e) {
    console.error(`[scheduler] Error queueing ${payload.url}:`, e);
    return false;
  }
}

/**
 * Queue a batch of tweets for processing
 */
async function processTweets(tweets: Tweet[]): Promise<void> {
  for (const tweet of tweets) {
    // Get the content DB record
    const content = getRecentContent(100).find(
      c => c.sourceType === "twitter" && c.contentId === tweet.id
    );

    if (content && !content.signalGenerated) {
      await addToSourceQueue({
        source_type: "twitter",
        url: tweet.url,
        title: tweet.text?.slice(0, 100),
        author: tweet.username,
        author_handle: tweet.username,
        publish_date: tweet.publishedAt.toISOString(),
        priority: 1, // Twitter gets higher priority
      }, content.id);
      // Small delay between API calls
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

/**
 * Queue a batch of YouTube videos for processing
 */
async function processVideos(videos: YouTubeVideo[]): Promise<void> {
  for (const video of videos) {
    const content = getRecentContent(100).find(
      c => c.sourceType === "youtube" && c.contentId === video.id
    );

    if (content && !content.signalGenerated) {
      await addToSourceQueue({
        source_type: "youtube",
        url: video.url,
        title: video.title,
        author: video.channelName,
        publish_date: video.publishedAt.toISOString(),
        priority: 0,
      }, content.id);
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

/**
 * Queue a batch of RSS items for processing
 */
async function processRSSItems(items: RSSItem[]): Promise<void> {
  for (const item of items) {
    const content = getRecentContent(100).find(
      c => c.sourceType === "rss" && c.contentId === item.id
    );

    if (content && !content.signalGenerated) {
      await addToSourceQueue({
        source_type: "article",
        url: item.url,
        title: item.title,
        author: item.feedName,
        publish_date: item.publishedAt.toISOString(),
        priority: 0,
      }, content.id);
      await new Promise(r => setTimeout(r, 500));
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

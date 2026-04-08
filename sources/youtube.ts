/**
 * Signal Trade - YouTube Monitor
 *
 * Monitor YouTube channels for new videos
 *
 * Supports multiple methods:
 * 1. YouTube Data API v3 (requires YOUTUBE_API_KEY)
 * 2. Invidious instance (requires INVIDIOUS_URL)
 * 3. Direct RSS (deprecated by YouTube, may not work)
 */

import { YOUTUBE_SOURCES, POLLING_CONFIG } from "./config";
import { isContentProcessed, saveContent, updateSourceLastCheck, generateContentId } from "./storage";

// Configuration
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
const INVIDIOUS_URL = process.env.INVIDIOUS_URL || "";

export interface YouTubeVideo {
  id: string;
  channelId: string;
  channelName: string;
  title: string;
  url: string;
  publishedAt: Date;
  description?: string;
}

/**
 * Fetch recent videos using YouTube Data API v3
 */
async function fetchViaYouTubeAPI(channelId: string, channelName: string): Promise<YouTubeVideo[]> {
  if (!YOUTUBE_API_KEY) return [];

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${channelId}&part=snippet&order=date&maxResults=10&type=video`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });

    if (!response.ok) {
      console.error(`[youtube] API error for ${channelName}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return (data.items || []).map((item: any) => ({
      id: item.id.videoId,
      channelId,
      channelName,
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      publishedAt: new Date(item.snippet.publishedAt),
      description: item.snippet.description,
    }));
  } catch (e) {
    console.error(`[youtube] API error for ${channelName}:`, e);
    return [];
  }
}

/**
 * Fetch recent videos using Invidious instance
 */
async function fetchViaInvidious(channelId: string, channelName: string): Promise<YouTubeVideo[]> {
  if (!INVIDIOUS_URL) return [];

  try {
    const url = `${INVIDIOUS_URL}/api/v1/channels/${channelId}/videos?fields=videoId,title,published,description`;
    const response = await fetch(url, {
      headers: { "User-Agent": "SignalTrade/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`[youtube] Invidious error for ${channelName}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return (data.videos || data || []).slice(0, 10).map((item: any) => ({
      id: item.videoId,
      channelId,
      channelName,
      title: item.title,
      url: `https://www.youtube.com/watch?v=${item.videoId}`,
      publishedAt: new Date(item.published * 1000),
      description: item.description,
    }));
  } catch (e) {
    console.error(`[youtube] Invidious error for ${channelName}:`, e);
    return [];
  }
}

/**
 * Fetch recent videos from a YouTube channel via RSS (deprecated, may not work)
 */
async function fetchViaRSS(channelId: string, channelName: string): Promise<YouTubeVideo[]> {
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const response = await fetch(rssUrl, {
      headers: { "User-Agent": "SignalTrade/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      // Don't log error - RSS is deprecated
      return [];
    }

    const xml = await response.text();
    return parseYouTubeRSS(xml, channelId, channelName);
  } catch (e) {
    return [];
  }
}

/**
 * Fetch recent videos from a YouTube channel (tries multiple methods)
 */
async function fetchChannelVideos(channelId: string, channelName: string): Promise<YouTubeVideo[]> {
  // Try YouTube API first (most reliable)
  if (YOUTUBE_API_KEY) {
    const videos = await fetchViaYouTubeAPI(channelId, channelName);
    if (videos.length > 0) return videos;
  }

  // Try Invidious
  if (INVIDIOUS_URL) {
    const videos = await fetchViaInvidious(channelId, channelName);
    if (videos.length > 0) return videos;
  }

  // Fallback to RSS (likely won't work)
  return fetchViaRSS(channelId, channelName);
}

/**
 * Parse YouTube RSS feed
 */
function parseYouTubeRSS(xml: string, channelId: string, channelName: string): YouTubeVideo[] {
  const videos: YouTubeVideo[] = [];

  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  const videoIdRegex = /<yt:videoId>([\s\S]*?)<\/yt:videoId>/;
  const titleRegex = /<title>([\s\S]*?)<\/title>/;
  const publishedRegex = /<published>([\s\S]*?)<\/published>/;
  const descriptionRegex = /<media:description>([\s\S]*?)<\/media:description>/;

  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const videoIdMatch = entry.match(videoIdRegex);
    const titleMatch = entry.match(titleRegex);
    const publishedMatch = entry.match(publishedRegex);
    const descriptionMatch = entry.match(descriptionRegex);

    if (videoIdMatch && titleMatch) {
      const videoId = videoIdMatch[1].trim();

      videos.push({
        id: videoId,
        channelId,
        channelName,
        title: decodeHTMLEntities(titleMatch[1].trim()),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: publishedMatch ? new Date(publishedMatch[1].trim()) : new Date(),
        description: descriptionMatch ? decodeHTMLEntities(descriptionMatch[1].trim()) : undefined,
      });
    }
  }

  return videos;
}

/**
 * Decode HTML entities
 */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Check if video is relevant for trading signals
 */
function isTradingRelevant(video: YouTubeVideo): boolean {
  const text = (video.title + " " + (video.description || "")).toLowerCase();

  // Trading keywords
  const keywords = [
    "bitcoin", "btc", "ethereum", "eth", "solana", "sol",
    "crypto", "altcoin", "defi", "market", "price",
    "analysis", "prediction", "forecast", "outlook",
    "bull", "bear", "breakout", "crash", "rally",
    "buy", "sell", "long", "short", "trade",
  ];

  // Exclude keywords (community posts, unrelated content)
  const excludeKeywords = [
    "giveaway", "sponsor", "subscribe", "comment below",
    "merch", "course", "coaching",
  ];

  const hasRelevantKeyword = keywords.some(kw => text.includes(kw));
  const hasExcludeKeyword = excludeKeywords.some(kw => text.includes(kw));

  return hasRelevantKeyword && !hasExcludeKeyword;
}

/**
 * Check all YouTube sources for new videos
 */
export async function checkYouTubeSources(): Promise<YouTubeVideo[]> {
  const newVideos: YouTubeVideo[] = [];
  const channels = YOUTUBE_SOURCES.filter(s => s.enabled);

  console.log(`[youtube] Checking ${channels.length} channels...`);

  // Filter by age - only process recent videos
  const maxAge = POLLING_CONFIG.maxContentAgeMs;
  const now = Date.now();

  for (const channel of channels) {
    try {
      const videos = await fetchChannelVideos(channel.channelId, channel.name);

      for (const video of videos) {
        // Check age
        const age = now - video.publishedAt.getTime();
        if (age > maxAge) {
          continue;
        }

        // Skip if already processed
        if (isContentProcessed("youtube", video.id)) {
          continue;
        }

        // Skip if not trading-relevant
        if (!isTradingRelevant(video)) {
          continue;
        }

        // Save to database
        saveContent({
          id: generateContentId(),
          sourceType: "youtube",
          sourceName: channel.name,
          contentId: video.id,
          contentUrl: video.url,
          contentText: video.title,
          publishedAt: video.publishedAt.toISOString(),
          processedAt: new Date().toISOString(),
        });

        newVideos.push(video);
        console.log(`[youtube] New video from ${channel.name}: ${video.title.slice(0, 50)}...`);
      }

      updateSourceLastCheck(`youtube:${channel.channelId}`);

      // Small delay between channels
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error(`[youtube] Error checking ${channel.name}:`, e);
    }
  }

  console.log(`[youtube] Found ${newVideos.length} new trading-relevant videos`);
  return newVideos;
}

/**
 * Signal Trade - Twitter Monitor
 *
 * Monitor Twitter accounts for new trading-related tweets
 * Uses RSS bridges and Nitter instances as fallback
 */

import { TWITTER_SOURCES, POLLING_CONFIG } from "./config";
import { isContentProcessed, saveContent, updateSourceLastCheck, getLastCheck, generateContentId } from "./storage";
import { saveNews } from "../shared/storage";

// Nitter instances for RSS feeds (Twitter alternatives)
const NITTER_INSTANCES = [
  "https://nitter.privacydev.net",
  "https://nitter.poast.org",
  "https://nitter.net",
];

// RSSBridge instance for Twitter
const RSS_BRIDGE_URL = process.env.RSS_BRIDGE_URL || "https://rss-bridge.org/bridge01";

export interface Tweet {
  id: string;
  username: string;
  text: string;
  url: string;
  publishedAt: Date;
}

/**
 * Fetch recent tweets from a Twitter account using Nitter RSS
 */
async function fetchTweetsViaNitter(username: string): Promise<Tweet[]> {
  const tweets: Tweet[] = [];

  for (const instance of NITTER_INSTANCES) {
    try {
      const rssUrl = `${instance}/${username}/rss`;
      const response = await fetch(rssUrl, {
        headers: { "User-Agent": "SignalTrade/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) continue;

      const xml = await response.text();
      const parsedTweets = parseNitterRSS(xml, username);

      if (parsedTweets.length > 0) {
        console.log(`[twitter] Fetched ${parsedTweets.length} tweets from @${username} via ${instance}`);
        return parsedTweets;
      }
    } catch (e) {
      // Try next instance
      continue;
    }
  }

  return tweets;
}

/**
 * Fetch tweets using RSS Bridge
 */
async function fetchTweetsViaRSSBridge(username: string): Promise<Tweet[]> {
  try {
    const url = `${RSS_BRIDGE_URL}/?action=display&bridge=TwitterBridge&context=By+username&u=${username}&format=Atom`;
    const response = await fetch(url, {
      headers: { "User-Agent": "SignalTrade/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];

    const xml = await response.text();
    return parseAtomFeed(xml, username);
  } catch (e) {
    console.error(`[twitter] RSS Bridge error for @${username}:`, e);
    return [];
  }
}

/**
 * Parse Nitter RSS feed
 */
function parseNitterRSS(xml: string, username: string): Tweet[] {
  const tweets: Tweet[] = [];

  // Simple regex-based parsing (works for RSS)
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const titleRegex = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/;
  const linkRegex = /<link>([\s\S]*?)<\/link>/;
  const guidRegex = /<guid[^>]*>([\s\S]*?)<\/guid>/;
  const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;

  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];

    const titleMatch = item.match(titleRegex);
    const linkMatch = item.match(linkRegex);
    const guidMatch = item.match(guidRegex);
    const pubDateMatch = item.match(pubDateRegex);

    if (titleMatch && linkMatch) {
      const text = (titleMatch[1] || titleMatch[2] || "").trim();
      const url = linkMatch[1].trim();
      const guid = guidMatch ? guidMatch[1].trim() : url;
      const pubDate = pubDateMatch ? new Date(pubDateMatch[1].trim()) : new Date();

      // Extract tweet ID from URL
      const idMatch = url.match(/status\/(\d+)/);
      const id = idMatch ? idMatch[1] : guid;

      tweets.push({
        id,
        username,
        text: decodeHTMLEntities(text),
        url: url.replace(/nitter\.[^/]+/, "twitter.com"),
        publishedAt: pubDate,
      });
    }
  }

  return tweets;
}

/**
 * Parse Atom feed from RSS Bridge
 */
function parseAtomFeed(xml: string, username: string): Tweet[] {
  const tweets: Tweet[] = [];

  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  const titleRegex = /<title[^>]*>([\s\S]*?)<\/title>/;
  const linkRegex = /<link[^>]*href="([^"]+)"/;
  const idRegex = /<id>([\s\S]*?)<\/id>/;
  const updatedRegex = /<updated>([\s\S]*?)<\/updated>/;
  const contentRegex = /<content[^>]*>([\s\S]*?)<\/content>/;

  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const titleMatch = entry.match(titleRegex);
    const linkMatch = entry.match(linkRegex);
    const idMatch = entry.match(idRegex);
    const updatedMatch = entry.match(updatedRegex);
    const contentMatch = entry.match(contentRegex);

    const url = linkMatch ? linkMatch[1] : "";
    const tweetIdMatch = url.match(/status\/(\d+)/);

    if (tweetIdMatch) {
      const text = contentMatch
        ? decodeHTMLEntities(contentMatch[1].replace(/<[^>]+>/g, " ").trim())
        : (titleMatch ? decodeHTMLEntities(titleMatch[1]) : "");

      tweets.push({
        id: tweetIdMatch[1],
        username,
        text,
        url,
        publishedAt: updatedMatch ? new Date(updatedMatch[1]) : new Date(),
      });
    }
  }

  return tweets;
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
    .replace(/&nbsp;/g, " ")
    .replace(/<!\[CDATA\[|\]\]>/g, "");
}

/**
 * Check if tweet is relevant for trading signals
 */
function isTradingRelevant(tweet: Tweet): boolean {
  const text = tweet.text.toLowerCase();

  // Trading keywords
  const keywords = [
    "long", "short", "buy", "sell", "bullish", "bearish",
    "entry", "target", "stop", "breakout", "breakdown",
    "btc", "eth", "sol", "bitcoin", "ethereum", "solana",
    "support", "resistance", "accumulate", "dump", "pump",
    "chart", "setup", "position", "dca", "leverage",
  ];

  // Check for at least one keyword
  return keywords.some(kw => text.includes(kw));
}

/**
 * Fetch tweets from a single account
 */
export async function fetchAccountTweets(username: string): Promise<Tweet[]> {
  // Try Nitter first, then RSS Bridge
  let tweets = await fetchTweetsViaNitter(username);

  if (tweets.length === 0) {
    tweets = await fetchTweetsViaRSSBridge(username);
  }

  // Filter by age - only process recent tweets
  const maxAge = POLLING_CONFIG.maxContentAgeMs;
  const now = Date.now();

  return tweets.filter(t => {
    const age = now - t.publishedAt.getTime();
    return age < maxAge;
  });
}

/**
 * Check all Twitter sources for new content
 */
export async function checkTwitterSources(): Promise<Tweet[]> {
  const newTweets: Tweet[] = [];
  const accounts = TWITTER_SOURCES.filter(s => s.enabled);

  console.log(`[twitter] Checking ${accounts.length} accounts...`);

  for (const account of accounts) {
    try {
      const tweets = await fetchAccountTweets(account.username);

      for (const tweet of tweets) {
        // Skip if already processed
        if (isContentProcessed("twitter", tweet.id)) {
          continue;
        }

        // Skip if not trading-relevant
        if (!isTradingRelevant(tweet)) {
          continue;
        }

        // Save to database
        saveContent({
          id: generateContentId(),
          sourceType: "twitter",
          sourceName: account.name,
          contentId: tweet.id,
          contentUrl: tweet.url,
          contentText: tweet.text,
          publishedAt: tweet.publishedAt.toISOString(),
          processedAt: new Date().toISOString(),
        });

        // Also save as news item for the news feed
        try {
          saveNews({
            id: `news_twitter_${tweet.id}`,
            headline: tweet.text.slice(0, 200),
            summary: tweet.text,
            source: account.name,
            source_type: "twitter",
            author: account.name,
            author_handle: account.username,
            url: tweet.url,
            published_at: tweet.publishedAt.toISOString(),
          });
        } catch (e) {
          // Ignore duplicate news
        }

        newTweets.push(tweet);
        console.log(`[twitter] New tweet from @${account.username}: ${tweet.text.slice(0, 50)}...`);
      }

      updateSourceLastCheck(`twitter:${account.username}`);

      // Rate limiting - small delay between accounts
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`[twitter] Error checking @${account.username}:`, e);
    }
  }

  console.log(`[twitter] Found ${newTweets.length} new trading-relevant tweets`);
  return newTweets;
}

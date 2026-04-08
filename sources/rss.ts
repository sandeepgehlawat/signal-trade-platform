/**
 * Signal Trade - RSS Feed Monitor
 *
 * Monitor RSS feeds for trading-related news
 */

import { RSS_SOURCES, POLLING_CONFIG, type RSSSource } from "./config";
import { isContentProcessed, saveContent, updateSourceLastCheck, generateContentId } from "./storage";
import { saveNews } from "../shared/storage";

export interface RSSItem {
  id: string;
  feedName: string;
  title: string;
  url: string;
  content?: string;
  publishedAt: Date;
}

/**
 * Fetch items from an RSS feed
 */
async function fetchRSSFeed(source: RSSSource): Promise<RSSItem[]> {
  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent": "SignalTrade/1.0",
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`[rss] Failed to fetch ${source.name}: ${response.status}`);
      return [];
    }

    const xml = await response.text();

    // Detect feed type and parse
    if (xml.includes("<feed") && xml.includes("xmlns=\"http://www.w3.org/2005/Atom\"")) {
      return parseAtomFeed(xml, source.name);
    } else {
      return parseRSSFeed(xml, source.name);
    }
  } catch (e) {
    console.error(`[rss] Error fetching ${source.name}:`, e);
    return [];
  }
}

/**
 * Parse RSS 2.0 feed
 */
function parseRSSFeed(xml: string, feedName: string): RSSItem[] {
  const items: RSSItem[] = [];

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const titleRegex = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/;
  const linkRegex = /<link>([\s\S]*?)<\/link>/;
  const guidRegex = /<guid[^>]*>([\s\S]*?)<\/guid>/;
  const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;
  const descriptionRegex = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/;

  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];

    const titleMatch = item.match(titleRegex);
    const linkMatch = item.match(linkRegex);
    const guidMatch = item.match(guidRegex);
    const pubDateMatch = item.match(pubDateRegex);
    const descriptionMatch = item.match(descriptionRegex);

    if (titleMatch && linkMatch) {
      const title = decodeHTMLEntities((titleMatch[1] || titleMatch[2] || "").trim());
      const url = linkMatch[1].trim();
      const guid = guidMatch ? guidMatch[1].trim() : url;
      const pubDate = pubDateMatch ? new Date(pubDateMatch[1].trim()) : new Date();
      const description = descriptionMatch
        ? decodeHTMLEntities((descriptionMatch[1] || descriptionMatch[2] || "").trim())
        : undefined;

      // Generate ID from URL or guid
      const id = generateItemId(guid);

      items.push({
        id,
        feedName,
        title,
        url,
        content: description,
        publishedAt: pubDate,
      });
    }
  }

  return items;
}

/**
 * Parse Atom feed
 */
function parseAtomFeed(xml: string, feedName: string): RSSItem[] {
  const items: RSSItem[] = [];

  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  const titleRegex = /<title[^>]*>([\s\S]*?)<\/title>/;
  const linkRegex = /<link[^>]*href="([^"]+)"[^>]*\/?>|<link[^>]*>([^<]+)<\/link>/;
  const idRegex = /<id>([\s\S]*?)<\/id>/;
  const publishedRegex = /<published>([\s\S]*?)<\/published>|<updated>([\s\S]*?)<\/updated>/;
  const summaryRegex = /<summary[^>]*>([\s\S]*?)<\/summary>/;
  const contentRegex = /<content[^>]*>([\s\S]*?)<\/content>/;

  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const titleMatch = entry.match(titleRegex);
    const linkMatch = entry.match(linkRegex);
    const idMatch = entry.match(idRegex);
    const publishedMatch = entry.match(publishedRegex);
    const summaryMatch = entry.match(summaryRegex);
    const contentMatch = entry.match(contentRegex);

    if (titleMatch) {
      const title = decodeHTMLEntities(titleMatch[1].trim());
      const url = linkMatch ? (linkMatch[1] || linkMatch[2] || "").trim() : "";
      const atomId = idMatch ? idMatch[1].trim() : url;
      const pubDate = publishedMatch
        ? new Date((publishedMatch[1] || publishedMatch[2]).trim())
        : new Date();
      const content = contentMatch
        ? decodeHTMLEntities(contentMatch[1].replace(/<[^>]+>/g, " ").trim())
        : summaryMatch
        ? decodeHTMLEntities(summaryMatch[1].replace(/<[^>]+>/g, " ").trim())
        : undefined;

      const id = generateItemId(atomId);

      items.push({
        id,
        feedName,
        title,
        url,
        content,
        publishedAt: pubDate,
      });
    }
  }

  return items;
}

/**
 * Generate consistent ID from URL or guid
 */
function generateItemId(input: string): string {
  // Simple hash for consistent IDs
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `rss_${Math.abs(hash).toString(36)}`;
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
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if article is relevant for trading signals
 */
function isTradingRelevant(item: RSSItem): boolean {
  const text = (item.title + " " + (item.content || "")).toLowerCase();

  // Trading-relevant keywords
  const keywords = [
    "bitcoin", "btc", "ethereum", "eth", "solana", "sol",
    "crypto", "altcoin", "defi", "nft",
    "price", "surge", "crash", "rally", "dump", "pump",
    "bull", "bear", "breakout", "support", "resistance",
    "whale", "accumulation", "distribution",
    "sec", "regulation", "etf", "adoption",
    "market cap", "all-time high", "ath",
  ];

  // Exclude keywords
  const excludeKeywords = [
    "sponsored", "advertisement", "partner content",
    "podcast", "interview", "opinion",
  ];

  const hasRelevantKeyword = keywords.some(kw => text.includes(kw));
  const hasExcludeKeyword = excludeKeywords.some(kw => text.includes(kw));

  return hasRelevantKeyword && !hasExcludeKeyword;
}

/**
 * Check all RSS sources for new articles
 */
export async function checkRSSSources(): Promise<RSSItem[]> {
  const newItems: RSSItem[] = [];
  const feeds = RSS_SOURCES.filter(s => s.enabled);

  console.log(`[rss] Checking ${feeds.length} feeds...`);

  // Filter by age - only process recent articles
  const maxAge = POLLING_CONFIG.maxContentAgeMs;
  const now = Date.now();

  for (const feed of feeds) {
    try {
      const items = await fetchRSSFeed(feed);

      for (const item of items) {
        // Check age
        const age = now - item.publishedAt.getTime();
        if (age > maxAge) {
          continue;
        }

        // Skip if already processed
        if (isContentProcessed("rss", item.id)) {
          continue;
        }

        // Skip if not trading-relevant
        if (!isTradingRelevant(item)) {
          continue;
        }

        // Save to source_content database
        saveContent({
          id: generateContentId(),
          sourceType: "rss",
          sourceName: feed.name,
          contentId: item.id,
          contentUrl: item.url,
          contentText: item.title,
          publishedAt: item.publishedAt.toISOString(),
          processedAt: new Date().toISOString(),
        });

        // Also save as news item for the news feed
        try {
          saveNews({
            id: `news_${item.id}`,
            headline: item.title,
            summary: item.content?.slice(0, 500),
            source: feed.name,
            source_type: "news",
            url: item.url,
            published_at: item.publishedAt.toISOString(),
          });
        } catch (e) {
          // Ignore duplicate news
        }

        newItems.push(item);
        console.log(`[rss] New article from ${feed.name}: ${item.title.slice(0, 50)}...`);
      }

      updateSourceLastCheck(`rss:${feed.name}`);

      // Small delay between feeds
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.error(`[rss] Error checking ${feed.name}:`, e);
    }
  }

  console.log(`[rss] Found ${newItems.length} new trading-relevant articles`);
  return newItems;
}

/**
 * Signal Trade - Source Monitoring Configuration
 *
 * Configure Twitter accounts, YouTube channels, and RSS feeds to monitor
 */

export interface TwitterSource {
  type: "twitter";
  username: string; // @handle without @
  name: string;
  enabled: boolean;
}

export interface YouTubeSource {
  type: "youtube";
  channelId: string; // UC... channel ID
  name: string;
  enabled: boolean;
}

export interface RSSSource {
  type: "rss";
  url: string;
  name: string;
  enabled: boolean;
}

export type Source = TwitterSource | YouTubeSource | RSSSource;

// ============================================================================
// SOURCES TO MONITOR
// ============================================================================

export const TWITTER_SOURCES: TwitterSource[] = [
  // Crypto traders
  { type: "twitter", username: "CryptoCred", name: "Crypto Cred", enabled: true },
  { type: "twitter", username: "HsakaTrades", name: "Hsaka", enabled: true },
  { type: "twitter", username: "CryptoKaleo", name: "Kaleo", enabled: true },
  { type: "twitter", username: "inversebrah", name: "inversebrah", enabled: true },
  { type: "twitter", username: "loomdart", name: "loomdart", enabled: true },
  { type: "twitter", username: "trader1sz", name: "Trader1sz", enabled: true },
  // Macro/Analysis
  { type: "twitter", username: "MacroAlf", name: "Macro Alf", enabled: true },
  { type: "twitter", username: "zaborowskixyz", name: "Zaborowski", enabled: true },
  // Add more accounts here
];

export const YOUTUBE_SOURCES: YouTubeSource[] = [
  // Note: YouTube RSS requires correct channel IDs
  // Find channel ID: View page source, search for "channelId" or "externalId"
  { type: "youtube", channelId: "UCqK_GSMbpiV8spgD3ZGloSw", name: "Coin Bureau", enabled: true },
  { type: "youtube", channelId: "UCRvqjQPSeaWn-uEx-w0XOIg", name: "Benjamin Cowen", enabled: true },
  { type: "youtube", channelId: "UCvGAjPKiXP0NLPQlVgVBh9w", name: "DataDash", enabled: true },
  { type: "youtube", channelId: "UCJgHxpqfhWEEjYH2cK1_D_w", name: "Altcoin Daily", enabled: true },
  // Add more channels here
];

export const RSS_SOURCES: RSSSource[] = [
  { type: "rss", url: "https://cointelegraph.com/rss", name: "CoinTelegraph", enabled: true },
  { type: "rss", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", name: "CoinDesk", enabled: true },
  { type: "rss", url: "https://decrypt.co/feed", name: "Decrypt", enabled: true },
  { type: "rss", url: "https://thedefiant.io/feed", name: "The Defiant", enabled: true },
  // Add more RSS feeds here
];

// ============================================================================
// POLLING CONFIGURATION
// ============================================================================

export const POLLING_CONFIG = {
  // How often to check each source type (in milliseconds)
  intervals: {
    twitter: 2 * 60 * 1000,   // Every 2 minutes
    youtube: 10 * 60 * 1000,  // Every 10 minutes
    rss: 5 * 60 * 1000,       // Every 5 minutes
  },

  // Maximum age of content to process (don't process old stuff on first run)
  maxContentAgeMs: 60 * 60 * 1000, // 1 hour

  // Rate limiting
  rateLimits: {
    twitter: {
      requestsPerWindow: 15,
      windowMs: 15 * 60 * 1000, // 15 minutes
    },
    youtube: {
      requestsPerWindow: 100,
      windowMs: 60 * 60 * 1000, // 1 hour
    },
  },

  // Retry configuration
  retries: {
    maxAttempts: 3,
    backoffMs: 5000,
  },
};

// ============================================================================
// HELPERS
// ============================================================================

export function getAllSources(): Source[] {
  return [
    ...TWITTER_SOURCES.filter(s => s.enabled),
    ...YOUTUBE_SOURCES.filter(s => s.enabled),
    ...RSS_SOURCES.filter(s => s.enabled),
  ];
}

export function getEnabledTwitterAccounts(): string[] {
  return TWITTER_SOURCES.filter(s => s.enabled).map(s => s.username);
}

export function getEnabledYouTubeChannels(): string[] {
  return YOUTUBE_SOURCES.filter(s => s.enabled).map(s => s.channelId);
}

export function getEnabledRSSFeeds(): RSSSource[] {
  return RSS_SOURCES.filter(s => s.enabled);
}

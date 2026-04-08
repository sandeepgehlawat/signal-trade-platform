"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { NeoCard } from "@/components/Neo";
import { feedApi, type NewsItem } from "@/lib/api";

function timeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
}

function getSourceIcon(sourceType: string) {
  switch (sourceType) {
    case "twitter":
      return <span className="text-foreground text-lg">{"\uD835\uDD4F"}</span>;
    case "youtube":
      return <span className="text-red-500 text-lg">{"\u25B6"}</span>;
    case "news":
    default:
      return <span className="text-blue-500 text-lg">{"\u25C9"}</span>;
  }
}

function getSourceColor(sourceType: string) {
  switch (sourceType) {
    case "twitter":
      return "border-l-gray-400";
    case "youtube":
      return "border-l-red-500";
    case "news":
    default:
      return "border-l-blue-500";
  }
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <div className={`neo-raised p-4 rounded-xl border-l-4 ${getSourceColor(item.source_type)}`}>
      {/* Header: Source + Time */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {getSourceIcon(item.source_type)}
          <span className="text-sm font-medium text-muted">{item.source}</span>
          {item.author && (
            <span className="text-sm text-muted">
              by {item.author_handle ? `@${item.author_handle}` : item.author}
            </span>
          )}
        </div>
        <span className="text-xs text-muted">{timeAgo(item.published_at)}</span>
      </div>

      {/* Headline */}
      <h3 className="font-semibold text-foreground mb-2 leading-snug">
        {item.headline}
      </h3>

      {/* Summary if available */}
      {item.summary && (
        <p className="text-sm text-muted mb-3 line-clamp-2">
          {item.summary}
        </p>
      )}

      {/* Footer: Assets + Link */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {item.assets && item.assets.length > 0 && (
            <div className="flex gap-1">
              {item.assets.slice(0, 3).map((asset) => (
                <span
                  key={asset}
                  className="neo-pressed px-2 py-0.5 rounded text-xs font-medium"
                >
                  {asset}
                </span>
              ))}
            </div>
          )}
          {item.sentiment && (
            <span
              className={`text-xs font-medium ${
                item.sentiment === "bullish"
                  ? "text-green-500"
                  : item.sentiment === "bearish"
                  ? "text-red-500"
                  : "text-muted"
              }`}
            >
              {item.sentiment}
            </span>
          )}
        </div>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="neo-button px-3 py-1.5 text-sm font-medium"
          >
            Read full article &rarr;
          </a>
        )}
      </div>
    </div>
  );
}

const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds

export default function FeedsPage() {
  const [filter, setFilter] = useState<"all" | "twitter" | "youtube" | "news">("all");
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadFeed = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    }
    setError(null);

    try {
      const news = await feedApi.news(100).catch(() => []);

      // Filter by source type if needed
      let filtered = news;
      if (filter !== "all") {
        filtered = news.filter((item) => item.source_type === filter);
      }

      // Sort by most recent
      filtered.sort(
        (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
      );

      setNewsItems(filtered);
      setLastUpdated(new Date());
    } catch (e) {
      console.error("Failed to load feed:", e);
      setError("Failed to load news feed. Will retry...");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [filter]);

  // Initial load and filter change
  useEffect(() => {
    setLoading(true);
    loadFeed();
  }, [filter, loadFeed]);

  // Auto-refresh
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      loadFeed();
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [loadFeed]);

  const handleManualRefresh = () => {
    loadFeed(true);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          &larr; Back
        </Link>
        <div className="flex items-center gap-4">
          {lastUpdated && (
            <span className="text-xs text-muted">
              Updated {timeAgo(lastUpdated.toISOString())}
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold">News Feed</h1>
        <p className="text-sm text-muted">Latest crypto news from Twitter, YouTube, and RSS feeds</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(["all", "news", "twitter", "youtube"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                filter === f
                  ? "neo-pressed text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className={`text-muted hover:text-foreground transition-all ${isRefreshing ? "animate-spin" : ""}`}
          title="Refresh"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="neo-raised p-3 text-sm text-amber-500 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="neo-raised p-4 rounded-xl animate-pulse">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-muted/20 rounded"></div>
                <div className="w-24 h-4 bg-muted/20 rounded"></div>
              </div>
              <div className="w-full h-5 bg-muted/20 rounded mb-2"></div>
              <div className="w-3/4 h-4 bg-muted/20 rounded"></div>
            </div>
          ))}
        </div>
      ) : newsItems.length === 0 ? (
        <NeoCard className="text-center text-muted py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full neo-pressed flex items-center justify-center">
              <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-foreground">No news yet</p>
              <p className="text-sm">News will appear here as sources are monitored.</p>
              <p className="text-xs mt-2">Auto-refreshing every 30 seconds...</p>
            </div>
          </div>
        </NeoCard>
      ) : (
        <div className="flex flex-col gap-3">
          {newsItems.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Footer */}
      {newsItems.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted py-4">
          <span>{newsItems.length} articles</span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Auto-updating
          </span>
        </div>
      )}
    </div>
  );
}

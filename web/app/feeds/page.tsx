"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { NeoCard, NeoBadge } from "@/components/Neo";
import { api, type Trade } from "@/lib/api";
import { NewSignalForm } from "./NewSignalForm";

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

function fmtPct(n: number) {
  const prefix = n >= 0 ? "+" : "";
  return `${prefix}${n.toFixed(0)}%`;
}

function fmtPrice(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

// Combined feed item
interface FeedItem {
  id: string;
  type: "mock" | "real";
  avatar?: string;
  user_name: string;
  user_handle?: string;
  ticker: string;
  leverage?: string;
  headline: string;
  direction: "long" | "short" | string;
  pnl_pct: number;
  pnl_usd?: number;
  entry_price: number;
  exit_price?: number;
  current_price?: number;
  time_ago: string;
  timestamp: string;
  platform: string;
  reasoning?: string[];
  source_type?: string;
  status?: string;
  trade_id?: string;
}

function FeedItemCard({ item, isExpanded, onToggle }: {
  item: FeedItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isPositive = item.pnl_pct >= 0;
  const directionTone = item.direction === "long" ? "bull" : "bear";
  const isOpen = item.status === "open";

  return (
    <div className={`neo-raised p-4 rounded-xl ${isOpen ? "border-l-2 border-green-500" : ""}`}>
      {/* Main Row */}
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={onToggle}
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full neo-pressed flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden">
          {item.avatar ? (
            <img src={item.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            item.user_name.slice(0, 2).toUpperCase()
          )}
        </div>

        {/* Source Icon */}
        {item.source_type === "twitter" && (
          <span className="text-foreground text-sm flex-shrink-0">{"\uD835\uDD4F"}</span>
        )}
        {item.source_type === "youtube" && (
          <span className="text-red-500 text-sm flex-shrink-0">{"\u25B6"}</span>
        )}
        {item.source_type === "news" && (
          <span className="text-blue-500 text-sm flex-shrink-0">{"\u25C9"}</span>
        )}

        {/* Live Dot */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOpen ? "bg-green-500 animate-pulse" : "bg-muted/50"}`}></span>

        {/* Ticker + Leverage */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="font-bold">{item.ticker}</span>
          {item.leverage && (
            <span className="text-xs text-muted">{item.leverage}</span>
          )}
        </div>

        {/* Headline */}
        <p className="text-sm text-muted flex-1 truncate min-w-0">
          {item.headline}
        </p>

        {/* Direction Badge */}
        <NeoBadge tone={directionTone}>
          {item.direction.toUpperCase()}
        </NeoBadge>

        {/* P&L */}
        <span className={`font-semibold text-sm flex-shrink-0 min-w-[60px] text-right ${isPositive ? "text-bull" : "text-bear"}`}>
          {fmtPct(item.pnl_pct)}
        </span>

        {/* Time */}
        <span className="text-xs text-muted flex-shrink-0 w-8 text-right">
          {item.time_ago}
        </span>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-muted/20">
          {/* Trade Details */}
          <div className="flex items-center gap-4 mb-4 text-sm">
            <div className="neo-pressed px-3 py-1.5 rounded-lg">
              <span className="text-muted">Entry:</span>{" "}
              <span className="font-medium">{fmtPrice(item.entry_price)}</span>
            </div>
            {item.exit_price && (
              <div className="neo-pressed px-3 py-1.5 rounded-lg">
                <span className="text-muted">Exit:</span>{" "}
                <span className="font-medium">{fmtPrice(item.exit_price)}</span>
              </div>
            )}
            {item.current_price && !item.exit_price && (
              <div className="neo-pressed px-3 py-1.5 rounded-lg">
                <span className="text-muted">Current:</span>{" "}
                <span className="font-medium">{fmtPrice(item.current_price)}</span>
              </div>
            )}
            {item.pnl_usd !== undefined && (
              <div className={`neo-pressed px-3 py-1.5 rounded-lg ${item.pnl_usd >= 0 ? "text-bull" : "text-bear"}`}>
                <span className="font-medium">
                  {item.pnl_usd >= 0 ? "+" : ""}${Math.abs(item.pnl_usd).toLocaleString()}
                </span>
              </div>
            )}
            <div className="neo-pressed px-3 py-1.5 rounded-lg">
              <span className="text-xs text-muted">{item.platform}</span>
            </div>
            {isOpen && (
              <div className="neo-raised-sm px-2 py-1 rounded text-[10px] text-green-500 font-medium">
                LIVE
              </div>
            )}
          </div>

          {/* Reasoning Steps */}
          {item.reasoning && item.reasoning.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              {item.reasoning.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {i + 1}
                  </span>
                  <p className="text-sm text-foreground">{step}</p>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">
              @{item.user_handle || item.user_name.toLowerCase().replace(/\s/g, "_")}
            </span>
            {item.trade_id ? (
              <Link
                href={`/trades/${item.trade_id}`}
                className="neo-button px-3 py-1.5 text-sm font-medium"
              >
                see full trade &rarr;
              </Link>
            ) : (
              <Link
                href="/trades"
                className="neo-button px-3 py-1.5 text-sm font-medium"
              >
                see full trade &rarr;
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds

export default function FeedsPage() {
  const [filter, setFilter] = useState<"top" | "recent">("top");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
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
      // Fetch real trades only - no mock/demo data
      const realTrades = await api.trades().catch(() => []);

      const items: FeedItem[] = [];

      // Add real trades only
      realTrades.forEach((trade) => {
        // Calculate P&L percentage
        const entryPrice = trade.posted_price || trade.author_price || 0;
        const currentPrice = trade.current_price || entryPrice;
        let pnlPct = 0;
        if (entryPrice > 0) {
          if (trade.direction === "long") {
            pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
          } else {
            pnlPct = ((entryPrice - currentPrice) / entryPrice) * 100;
          }
        }

        items.push({
          id: `real_${trade.trade_id}`,
          type: "real",
          trade_id: trade.trade_id,
          user_name: trade.author || "Signal Trade",
          user_handle: trade.author_handle,
          ticker: trade.ticker.replace("-PERP", ""),
          leverage: "1x",
          headline: trade.headline_quote || `${trade.direction.toUpperCase()} ${trade.ticker}`,
          direction: trade.direction,
          pnl_pct: pnlPct,
          pnl_usd: trade.author_pnl,
          entry_price: entryPrice,
          current_price: currentPrice,
          time_ago: timeAgo(trade.opened_at || new Date().toISOString()),
          timestamp: trade.opened_at || new Date().toISOString(),
          platform: trade.platform,
          reasoning: trade.headline_quote ? [trade.headline_quote] : undefined,
          source_type: "news",
          status: trade.status,
        });
      });

      // Sort based on filter
      if (filter === "top") {
        items.sort((a, b) => Math.abs(b.pnl_pct) - Math.abs(a.pnl_pct));
      } else {
        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }

      setFeedItems(items);
      setLastUpdated(new Date());
    } catch (e) {
      console.error("Failed to load feed:", e);
      setError("Failed to load feed. Will retry...");
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
          <NewSignalForm />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setFilter("top")}
            className={`flex items-center gap-2 text-sm font-medium transition-colors ${
              filter === "top" ? "text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <span className={`w-2 h-2 rounded-full transition-colors ${filter === "top" ? "bg-green-500" : "bg-muted/30"}`}></span>
            top
          </button>
          <button
            onClick={() => setFilter("recent")}
            className={`text-sm font-medium transition-colors ${
              filter === "recent" ? "text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            recent
          </button>
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
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted/20"></div>
                <div className="w-8 h-4 bg-muted/20 rounded"></div>
                <div className="flex-1 h-4 bg-muted/20 rounded"></div>
                <div className="w-16 h-6 bg-muted/20 rounded-full"></div>
                <div className="w-12 h-4 bg-muted/20 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      ) : feedItems.length === 0 ? (
        <NeoCard className="text-center text-muted py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full neo-pressed flex items-center justify-center">
              <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-foreground">No trades yet</p>
              <p className="text-sm">Trades will appear here in real-time.</p>
              <p className="text-xs mt-2">Auto-refreshing every 30 seconds...</p>
            </div>
          </div>
        </NeoCard>
      ) : (
        <div className="flex flex-col gap-3">
          {feedItems.map((item) => (
            <FeedItemCard
              key={item.id}
              item={item}
              isExpanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      {feedItems.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted py-4">
          <span>{feedItems.length} trades</span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Auto-updating
          </span>
        </div>
      )}
    </div>
  );
}

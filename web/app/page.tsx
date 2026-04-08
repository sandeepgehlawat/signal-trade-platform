import Link from "next/link";
import { NeoCard, NeoStat, NeoButton, NeoBadge } from "@/components/Neo";
import { api, feedApi, type Stats, type Trade, type NewsItem, type MockTrade } from "@/lib/api";
import { InstallSkillButton } from "./InstallSkillButton";

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

function fmtNum(n: unknown, digits = 2) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function HowStep({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="neo-raised-sm p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full neo-pressed flex items-center justify-center text-xs font-semibold text-accent">
          {n}
        </span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-xs text-muted leading-relaxed">{body}</p>
    </div>
  );
}

function toneFor(direction?: string) {
  if (direction === "long" || direction === "bullish") return "bull" as const;
  if (direction === "short" || direction === "bearish") return "bear" as const;
  return "neutral" as const;
}

function sentimentTone(sentiment?: string) {
  if (sentiment === "bullish") return "bull" as const;
  if (sentiment === "bearish") return "bear" as const;
  return "neutral" as const;
}

function timeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

function fmtUsd(n: unknown) {
  if (typeof n !== "number" || Number.isNaN(n)) return "\u2014";
  const prefix = n >= 0 ? "+" : "";
  return `${prefix}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function DashboardPage() {
  const [stats, trades, news, mockTrades] = await Promise.all([
    safe<Stats>(api.stats(), {}),
    safe<Trade[]>(api.trades(), []),
    safe<NewsItem[]>(feedApi.news(10), []),
    safe<MockTrade[]>(feedApi.mockTrades(10), []),
  ]);

  const recent = trades.slice(0, 6);
  const recentNews = news.slice(0, 5);
  const recentMockTrades = mockTrades.slice(0, 5);
  const total = (stats.total as number) ?? trades.length;
  const open = (stats.open as number) ?? trades.filter((t) => t.status === "open").length;
  const closed = (stats.closed as number) ?? trades.filter((t) => t.status === "closed").length;
  const totalPnl = mockTrades.reduce((s, t) => s + t.pnl_usd, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8 sm:gap-10">
      <section className="neo-raised p-6 sm:p-10 flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <span className="neo-raised-sm px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-accent">
            AI Skill
          </span>
          <span className="text-xs text-muted">
            Claude Code · Codex · any LLM CLI
          </span>
        </div>
        <div className="flex flex-col gap-3 max-w-2xl">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
            Turn any tweet, video, or article into a tracked trade.
          </h1>
          <p className="text-sm sm:text-base text-muted leading-relaxed">
            Signal Trade is an LLM-powered skill that extracts trading theses from
            unstructured content, routes them to the right venue (Hyperliquid,
            Polymarket, OKX), and tracks live P&L against the author's original price.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/feeds">
            <NeoButton>Live Feeds</NeoButton>
          </Link>
          <Link href="/trades">
            <NeoButton>View Trades</NeoButton>
          </Link>
        </div>

        {/* Works In Section */}
        <div className="flex flex-col items-center gap-4 py-6 border-t border-b border-muted/20">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-1">Works in</h3>
            <p className="text-sm text-muted font-mono">Opencode, Claude, Codex</p>
          </div>
          <InstallSkillButton />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          <HowStep n="1" title="Extract" body="Paste a URL or text. Content is pulled and parsed." />
          <HowStep n="2" title="Analyze" body="The LLM extracts direction, assets, confidence, horizon." />
          <HowStep n="3" title="Route & Track" body="Theses route to perps, prediction markets, or spot — P&L updates live." />
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <NeoStat label="News Items" value={fmtNum(news.length, 0)} />
        <NeoStat label="Community Trades" value={fmtNum(mockTrades.length, 0)} />
        <NeoStat label="Open Positions" value={fmtNum(mockTrades.filter(t => !t.closed_at).length, 0)} />
        <NeoStat
          label="Community P&L"
          value={`$${fmtNum(totalPnl, 0)}`}
          hint={mockTrades.length > 0 ? `${mockTrades.filter(t => t.pnl_usd > 0).length}/${mockTrades.length} profitable` : undefined}
        />
      </section>

      {/* Live News Feed */}
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Live News</h2>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          </div>
          <Link href="/feeds" className="text-sm text-muted hover:text-foreground">
            View all &rarr;
          </Link>
        </div>

        {recentNews.length === 0 ? (
          <NeoCard className="text-center text-muted py-8">
            No news yet. Market-moving news will appear here in real-time.
          </NeoCard>
        ) : (
          <div className="flex flex-col gap-3">
            {recentNews.map((n) => (
              <NeoCard key={n.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium leading-snug line-clamp-2">
                      {n.headline}
                    </h3>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted">
                      <span>{n.source}</span>
                      {n.author_handle && <span>@{n.author_handle}</span>}
                      <span>{timeAgo(n.published_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {n.assets && n.assets.length > 0 && (
                      <span className="neo-pressed px-1.5 py-0.5 rounded text-[10px]">
                        {n.assets[0]}
                      </span>
                    )}
                    {n.sentiment && (
                      <NeoBadge tone={sentimentTone(n.sentiment)}>
                        {n.sentiment.toUpperCase()}
                      </NeoBadge>
                    )}
                  </div>
                </div>
              </NeoCard>
            ))}
          </div>
        )}
      </section>

      {/* Community Trades */}
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Community Trades</h2>
            <span className="neo-raised-sm px-2 py-0.5 text-[10px] font-medium text-green-500">
              LIVE
            </span>
          </div>
          <Link href="/trades" className="text-sm text-muted hover:text-foreground">
            View all &rarr;
          </Link>
        </div>

        {recentMockTrades.length === 0 ? (
          <NeoCard className="text-center text-muted py-8">
            No community trades yet. Trades based on news will appear here.
          </NeoCard>
        ) : (
          <div className="flex flex-col gap-3">
            {recentMockTrades.map((mt) => (
              <NeoCard key={mt.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full neo-pressed flex items-center justify-center text-xs font-bold">
                      {mt.user_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{mt.user_name}</span>
                        <span className="text-sm text-muted">{mt.ticker}</span>
                        <NeoBadge tone={toneFor(mt.direction)}>
                          {mt.direction.toUpperCase()}
                        </NeoBadge>
                      </div>
                      {mt.news_headline && (
                        <p className="text-xs text-muted line-clamp-1 mt-0.5 max-w-md">
                          On: {mt.news_headline}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span
                      className={`text-lg font-bold ${
                        mt.pnl_usd >= 0 ? "text-bull" : "text-bear"
                      }`}
                    >
                      {fmtUsd(mt.pnl_usd)}
                    </span>
                    <span className="text-xs text-muted">{timeAgo(mt.traded_at)}</span>
                  </div>
                </div>
              </NeoCard>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

import Link from "next/link";
import { NeoCard, NeoBadge } from "@/components/Neo";
import { api, feedApi, type Trade, type MockTrade } from "@/lib/api";

function fmt(n: unknown, d = 2) {
  if (typeof n !== "number" || Number.isNaN(n)) return "\u2014";
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}

function fmtUsd(n: unknown) {
  if (typeof n !== "number" || Number.isNaN(n)) return "\u2014";
  const prefix = n >= 0 ? "+" : "";
  return `${prefix}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: unknown) {
  if (typeof n !== "number" || Number.isNaN(n)) return "\u2014";
  const prefix = n >= 0 ? "+" : "";
  return `${prefix}${n.toFixed(2)}%`;
}

function toneFor(direction?: string) {
  if (direction === "long" || direction === "bullish") return "bull" as const;
  if (direction === "short" || direction === "bearish") return "bear" as const;
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

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
];

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = (status as "open" | "closed" | undefined) ?? undefined;

  // Fetch both real trades and mock trades
  const [trades, mockTrades] = await Promise.all([
    safe<Trade[]>(api.trades(filter), []),
    safe<MockTrade[]>(feedApi.mockTrades(50), []),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Trades</h1>
          <p className="text-sm text-muted mt-1">
            Track P&L from news-based trades
          </p>
        </div>
        <div className="flex items-center gap-2">
          {FILTERS.map((f) => {
            const active = (filter ?? "all") === f.key;
            const href = f.key === "all" ? "/trades" : `/trades?status=${f.key}`;
            return (
              <Link
                key={f.key}
                href={href}
                className={`px-4 py-2 rounded-2xl text-xs font-medium ${
                  active ? "neo-pressed text-foreground" : "neo-raised-sm text-muted"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Mock Trades with News Attribution */}
      {mockTrades.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              Community Trades
              <span className="neo-raised-sm px-2 py-0.5 text-[10px] font-medium text-green-500">
                LIVE
              </span>
            </h2>
            <span className="text-xs text-muted">
              {mockTrades.length} trades based on news
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {mockTrades.map((mt) => (
              <NeoCard key={mt.id} className="p-4">
                <div className="flex flex-col gap-3">
                  {/* News Attribution Header */}
                  {mt.news_headline && (
                    <div className="flex items-start gap-2 pb-2 border-b border-muted/20">
                      <span className="text-blue-500 text-lg">\u25C9</span>
                      <p className="text-sm text-muted leading-snug flex-1">
                        {mt.news_headline}
                      </p>
                    </div>
                  )}

                  {/* Trade Details */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* User */}
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full neo-pressed flex items-center justify-center text-xs font-bold">
                          {mt.user_name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium">{mt.user_name}</span>
                      </div>
                      {/* Ticker & Direction */}
                      <span className="text-lg font-semibold">{mt.ticker}</span>
                      <NeoBadge tone={toneFor(mt.direction)}>
                        {mt.direction.toUpperCase()}
                      </NeoBadge>
                      <span className="neo-raised-sm px-2 py-0.5 text-[10px] font-medium text-muted">
                        {mt.platform}
                      </span>
                    </div>
                    {/* P&L */}
                    <div className="flex flex-col items-end">
                      <span
                        className={`text-lg font-bold ${
                          mt.pnl_usd >= 0 ? "text-bull" : "text-bear"
                        }`}
                      >
                        {fmtUsd(mt.pnl_usd)}
                      </span>
                      <span
                        className={`text-xs ${
                          mt.pnl_pct >= 0 ? "text-bull" : "text-bear"
                        }`}
                      >
                        {fmtPct(mt.pnl_pct)}
                      </span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between text-xs text-muted">
                    <div className="flex items-center gap-4">
                      <span>
                        Entry: <span className="text-foreground">${fmt(mt.entry_price)}</span>
                      </span>
                      {mt.exit_price && (
                        <span>
                          Exit: <span className="text-foreground">${fmt(mt.exit_price)}</span>
                        </span>
                      )}
                      <span>
                        Size: <span className="text-foreground">${fmt(mt.position_size, 0)}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {mt.closed_at ? (
                        <span className="neo-pressed px-2 py-0.5 rounded text-[10px]">CLOSED</span>
                      ) : (
                        <span className="neo-raised-sm px-2 py-0.5 rounded text-[10px] text-green-500">OPEN</span>
                      )}
                      <span>{timeAgo(mt.traded_at)}</span>
                    </div>
                  </div>
                </div>
              </NeoCard>
            ))}
          </div>
        </section>
      )}

      {/* Divider if both sections exist */}
      {mockTrades.length > 0 && trades.length > 0 && (
        <div className="border-t border-muted/20" />
      )}

      {/* Your Trades Section */}
      {trades.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Your Trades</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {trades.map((t) => (
              <Link key={t.trade_id} href={`/trades/${t.trade_id}`} className="neo-card-link h-full">
                <NeoCard className="flex flex-col gap-3 h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold">{t.ticker}</span>
                    <NeoBadge tone={toneFor(t.direction)}>{t.direction}</NeoBadge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{t.platform}</span>
                    <span>{t.status}</span>
                  </div>
                  {t.headline_quote && (
                    <p className="text-sm text-muted line-clamp-3">"{t.headline_quote}"</p>
                  )}
                  <div className="mt-auto flex items-center justify-between text-sm">
                    <span className="text-muted">{fmt(t.posted_price)}</span>
                    <span
                      className={
                        (t.author_pnl ?? 0) >= 0
                          ? "text-bull font-semibold"
                          : "text-bear font-semibold"
                      }
                    >
                      {fmt(t.author_pnl)}
                    </span>
                  </div>
                </NeoCard>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {trades.length === 0 && mockTrades.length === 0 && (
        <NeoCard className="text-center text-muted py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full neo-pressed flex items-center justify-center">
              <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-foreground">No trades yet</p>
              <p className="text-sm">Trades based on news signals will appear here.</p>
            </div>
          </div>
        </NeoCard>
      )}
    </div>
  );
}

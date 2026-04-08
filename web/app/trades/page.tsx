import Link from "next/link";
import { NeoCard, NeoBadge } from "@/components/Neo";
import { api, type Trade } from "@/lib/api";

function fmt(n: unknown, d = 2) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}

function fmtPct(n: unknown) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
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

  const trades = await safe<Trade[]>(api.trades(filter), []);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Trades</h1>
          <p className="text-sm text-muted mt-1">
            Track P&L from signal-based trades
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

      {/* Trades Grid */}
      {trades.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">
              {trades.length} {trades.length === 1 ? "trade" : "trades"}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {trades.map((t) => {
              const pnl = t.posted_pnl ?? t.author_pnl ?? 0;
              return (
                <Link key={t.trade_id} href={`/trades/${t.trade_id}`} className="neo-card-link h-full">
                  <NeoCard className="flex flex-col gap-3 h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold">{t.ticker}</span>
                      <div className="flex items-center gap-2">
                        <NeoBadge tone={toneFor(t.direction)}>{t.direction}</NeoBadge>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          t.status === "open"
                            ? "bg-green-500/20 text-green-500"
                            : "bg-muted/20 text-muted"
                        }`}>
                          {t.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>{t.platform}</span>
                      {t.opened_at && <span>{timeAgo(t.opened_at)}</span>}
                    </div>
                    {t.headline_quote && (
                      <p className="text-sm text-muted line-clamp-2">"{t.headline_quote}"</p>
                    )}
                    <div className="mt-auto flex items-center justify-between text-sm pt-2 border-t border-muted/20">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted">Entry</span>
                        <span className="font-medium">${fmt(t.posted_price ?? t.author_price)}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-xs text-muted">P&L</span>
                        <span className={pnl >= 0 ? "text-bull font-semibold" : "text-bear font-semibold"}>
                          {fmtPct(pnl)}
                        </span>
                      </div>
                    </div>
                  </NeoCard>
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <NeoCard className="text-center text-muted py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full neo-pressed flex items-center justify-center">
              <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-foreground">No trades yet</p>
              <p className="text-sm">Process a signal to create your first trade.</p>
            </div>
            <Link href="/process" className="neo-button px-4 py-2 text-sm font-medium mt-2">
              New Signal
            </Link>
          </div>
        </NeoCard>
      )}
    </div>
  );
}

import Link from "next/link";
import { NeoCard, NeoStat, NeoButton, NeoBadge } from "@/components/Neo";
import { api, type Stats, type Trade } from "@/lib/api";
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

export default async function DashboardPage() {
  const [stats, trades] = await Promise.all([
    safe<Stats>(api.stats(), {}),
    safe<Trade[]>(api.trades(), []),
  ]);

  const recentTrades = trades.slice(0, 6);
  const total = (stats.total as number) ?? trades.length;
  const open = (stats.open as number) ?? trades.filter((t) => t.status === "open").length;
  const closed = (stats.closed as number) ?? trades.filter((t) => t.status === "closed").length;

  // Calculate real P&L from actual trades
  const totalPnl = trades.reduce((sum, t) => {
    const pnl = t.posted_pnl ?? t.author_pnl ?? 0;
    const entry = t.posted_price ?? t.author_price ?? 0;
    // Approximate USD P&L (entry * pnl% * assumed position)
    return sum + (entry * (pnl / 100) * 0.1); // 10% of entry as position size estimate
  }, 0);

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
        <NeoStat label="Total Trades" value={fmtNum(total, 0)} />
        <NeoStat label="Open Positions" value={fmtNum(open, 0)} />
        <NeoStat label="Closed" value={fmtNum(closed, 0)} />
        <NeoStat
          label="Total P&L"
          value={totalPnl >= 0 ? `+$${fmtNum(Math.abs(totalPnl), 0)}` : `-$${fmtNum(Math.abs(totalPnl), 0)}`}
          hint={trades.length > 0 ? `${trades.filter(t => (t.posted_pnl ?? 0) > 0).length}/${trades.length} profitable` : undefined}
        />
      </section>

      {/* Recent Trades */}
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Recent Trades</h2>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          </div>
          <Link href="/trades" className="text-sm text-muted hover:text-foreground">
            View all &rarr;
          </Link>
        </div>

        {recentTrades.length === 0 ? (
          <NeoCard className="text-center text-muted py-8">
            No trades yet. Process a signal to create your first trade.
          </NeoCard>
        ) : (
          <div className="flex flex-col gap-3">
            {recentTrades.map((t) => {
              const pnl = t.posted_pnl ?? t.author_pnl ?? 0;
              const entry = t.posted_price ?? t.author_price ?? 0;
              const current = t.current_price ?? entry;
              return (
                <Link key={t.trade_id} href={`/trades/${t.trade_id}`}>
                  <NeoCard className="p-4 hover:bg-muted/5 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full neo-pressed flex items-center justify-center text-xs font-bold">
                          {t.ticker.slice(0, 2)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{t.ticker}</span>
                            <NeoBadge tone={toneFor(t.direction)}>
                              {t.direction.toUpperCase()}
                            </NeoBadge>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${t.status === "open" ? "bg-green-500/20 text-green-500" : "bg-muted/20 text-muted"}`}>
                              {t.status.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-xs text-muted line-clamp-1 mt-0.5 max-w-md">
                            {t.headline_quote || `Entry: $${fmtNum(entry, 2)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={`text-lg font-bold ${pnl >= 0 ? "text-bull" : "text-bear"}`}>
                          {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
                        </span>
                        <span className="text-xs text-muted">
                          ${fmtNum(current, 2)}
                        </span>
                      </div>
                    </div>
                  </NeoCard>
                </Link>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}

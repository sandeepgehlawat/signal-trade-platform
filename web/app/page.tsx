import Link from "next/link";
import { NeoCard, NeoStat, NeoButton, NeoBadge } from "@/components/Neo";
import { api, feedApi, type Stats, type Trade, type Signal } from "@/lib/api";
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

export default async function DashboardPage() {
  const [stats, trades, signals] = await Promise.all([
    safe<Stats>(api.stats(), {}),
    safe<Trade[]>(api.trades(), []),
    safe<Signal[]>(feedApi.signals(10), []),
  ]);

  const recent = trades.slice(0, 6);
  const recentSignals = signals.slice(0, 5);
  const total = (stats.total as number) ?? trades.length;
  const open = (stats.open as number) ?? trades.filter((t) => t.status === "open").length;
  const closed = (stats.closed as number) ?? trades.filter((t) => t.status === "closed").length;
  const totalPnl = (stats.total_pnl as number) ?? trades.reduce((s, t) => s + (t.author_pnl ?? 0), 0);

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
        <NeoStat label="Open" value={fmtNum(open, 0)} />
        <NeoStat label="Closed" value={fmtNum(closed, 0)} />
        <NeoStat
          label="Total P&L"
          value={fmtNum(totalPnl)}
          hint={
            stats.win_rate != null
              ? `Win rate ${fmtNum((stats.win_rate as number) * 100, 1)}%`
              : undefined
          }
        />
      </section>

      {/* Live Signals Feed */}
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Live Signals</h2>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          </div>
          <Link href="/feeds" className="text-sm text-muted hover:text-foreground">
            View all →
          </Link>
        </div>

        {recentSignals.length === 0 ? (
          <NeoCard className="text-center text-muted py-8">
            No signals yet. Signals will appear here in real-time.
          </NeoCard>
        ) : (
          <div className="flex flex-col gap-3">
            {recentSignals.map((s) => (
              <NeoCard key={s.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">{s.ticker}</span>
                    <NeoBadge tone={toneFor(s.direction)}>{s.direction}</NeoBadge>
                  </div>
                  {s.headline_quote && (
                    <span className="text-sm text-muted hidden sm:inline truncate max-w-xs">
                      "{s.headline_quote}"
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted">${fmtNum(s.entry_price)}</span>
                  <span className="text-xs text-muted">{s.platform}</span>
                  <span className="text-xs text-muted">
                    {new Date(s.published_at).toLocaleTimeString()}
                  </span>
                </div>
              </NeoCard>
            ))}
          </div>
        )}
      </section>

      {/* Recent Trades */}
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent trades</h2>
          <Link href="/trades" className="text-sm text-muted hover:text-foreground">
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <NeoCard className="text-center text-muted">
            No trades yet. Drop a tweet, video, or article into{" "}
            <Link href="/process" className="underline">
              New Signal
            </Link>{" "}
            to get started.
          </NeoCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {recent.map((t) => (
              <Link key={t.trade_id} href={`/trades/${t.trade_id}`} className="neo-card-link">
                <NeoCard className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold">{t.ticker}</span>
                      <NeoBadge tone={toneFor(t.direction)}>{t.direction}</NeoBadge>
                    </div>
                    <span className="text-xs text-muted">{t.platform}</span>
                  </div>
                  {t.headline_quote && (
                    <p className="text-sm text-muted line-clamp-2">"{t.headline_quote}"</p>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Entry {fmtNum(t.posted_price)}</span>
                    <span
                      className={
                        (t.author_pnl ?? 0) >= 0
                          ? "text-bull font-semibold"
                          : "text-bear font-semibold"
                      }
                    >
                      {fmtNum(t.author_pnl)}
                    </span>
                  </div>
                </NeoCard>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

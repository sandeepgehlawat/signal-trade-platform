import Link from "next/link";
import { NeoCard, NeoBadge } from "@/components/Neo";
import { api, type Trade } from "@/lib/api";

function fmt(n: unknown, d = 2) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}

function toneFor(direction?: string) {
  if (direction === "long" || direction === "bullish") return "bull" as const;
  if (direction === "short" || direction === "bearish") return "bear" as const;
  return "neutral" as const;
}

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
];

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = (status as "open" | "closed" | undefined) ?? undefined;

  let trades: Trade[] = [];
  let error: string | null = null;
  try {
    trades = await api.trades(filter);
  } catch (e) {
    error = String(e);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Trades</h1>
          <p className="text-sm text-muted mt-1">
            {trades.length} {trades.length === 1 ? "trade" : "trades"}
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

      {error && <NeoCard className="text-bear text-sm">{error}</NeoCard>}

      {trades.length === 0 && !error ? (
        <NeoCard className="text-center text-muted">No trades.</NeoCard>
      ) : (
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
      )}
    </div>
  );
}

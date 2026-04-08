import Link from "next/link";
import { NeoCard, NeoStat, NeoBadge } from "@/components/Neo";
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

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let trade: Trade | null = null;
  let error: string | null = null;
  try {
    trade = await api.trade(id);
  } catch (e) {
    error = String(e);
  }

  if (error || !trade) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <NeoCard className="text-bear">{error ?? "Trade not found"}</NeoCard>
        <Link href="/trades" className="text-sm text-muted mt-4 inline-block">
          ← Back to trades
        </Link>
      </div>
    );
  }

  const pnl = trade.author_pnl ?? 0;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      <Link href="/trades" className="text-sm text-muted hover:text-foreground">
        ← Back to trades
      </Link>

      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{trade.ticker}</h1>
            <NeoBadge tone={toneFor(trade.direction)}>{trade.direction}</NeoBadge>
            <NeoBadge>{trade.status}</NeoBadge>
          </div>
          <p className="text-sm text-muted">
            {trade.platform}
            {trade.author && ` · ${trade.author}`}
          </p>
        </div>
        {/* Close trade available via API only (auth required) */}
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <NeoStat label="Author Price" value={fmt(trade.author_price)} />
        <NeoStat label="Posted Price" value={fmt(trade.posted_price)} />
        <NeoStat label="Current Price" value={fmt(trade.current_price)} />
        <NeoStat
          label="Author P&L"
          value={
            <span className={pnl >= 0 ? "text-bull" : "text-bear"}>{fmt(pnl)}</span>
          }
          hint={trade.posted_pnl != null ? `Posted P&L ${fmt(trade.posted_pnl)}` : undefined}
        />
      </section>

      {trade.headline_quote && (
        <NeoCard>
          <h2 className="text-xs uppercase tracking-wider text-muted mb-2">
            Headline quote
          </h2>
          <p className="text-base text-foreground">"{trade.headline_quote}"</p>
        </NeoCard>
      )}

      {trade.source_url && (
        <NeoCard>
          <h2 className="text-xs uppercase tracking-wider text-muted mb-2">Source</h2>
          <a
            href={trade.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-accent break-all underline"
          >
            {trade.source_url}
          </a>
          {trade.source_date && (
            <p className="text-xs text-muted mt-1">{trade.source_date}</p>
          )}
        </NeoCard>
      )}
    </div>
  );
}

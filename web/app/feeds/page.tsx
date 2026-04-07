import Link from "next/link";
import { NeoCard, NeoBadge } from "@/components/Neo";
import { feedApi, type Signal } from "@/lib/api";
import { NewSignalForm } from "./NewSignalForm";

// Live feed sources configuration
const LIVE_SOURCES = [
  {
    id: "twitter",
    name: "Twitter/X",
    icon: "𝕏",
    color: "text-foreground",
    accounts: [
      // Founders & Executives
      "cz_binance", "saylor", "VitalikButerin", "brian_armstrong",
      "APompliano", "novogratz", "BarrySilbert", "balajis",
      "aantonop", "NickSzabo4", "naval", "chamath",
      "jack", "cdixon", "pmarca", "tyler",
      // Institutional & Analysts
      "100trillionUSD", "woonomic", "WClementeIII", "dylanleclair_",
      "PrestonPysh", "RaoulGMI", "Mark_Yusko", "CaitlinLong_",
      "CryptoHayes", "adam3us", "ErikVoorhees", "TuurDemeester",
      // Top Traders
      "PeterLBrandt", "CryptoCapo_", "inversebrah", "HsakaTrades",
      "CryptoCred", "EmperorBTC", "TheCryptoDog", "CryptoKaleo",
      "Pentosh1", "SmartContracter", "loomdart", "AltcoinPsycho",
      "GCRClassic", "CryptoMessiah", "blknoiz06", "Trader_XO",
      // Projects & Official
      "Bitcoin", "ethereum", "SolanaFndn", "Ripple",
      "binance", "coinbase", "gemini", "BitMEXResearch"
    ]
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: "▶",
    color: "text-red-500",
    accounts: [
      "Coin Bureau", "Benjamin Cowen", "DataDash", "Altcoin Daily",
      "InvestAnswers", "Lark Davis", "Anthony Pompliano", "Real Vision"
    ]
  },
  {
    id: "news",
    name: "News",
    icon: "◉",
    color: "text-blue-500",
    accounts: [
      "CoinDesk", "The Block", "Decrypt", "CoinTelegraph", "Bitcoin Magazine",
      "Blockworks", "DL News", "Unchained", "The Defiant", "Messari",
      "Bloomberg Crypto", "Reuters Crypto", "WSJ Crypto", "Forbes Crypto"
    ]
  },
  { id: "custom", name: "Custom", icon: "◈", color: "text-accent", accounts: ["User submitted"] },
];

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

// Reputable signals have high confidence (>=70%)
function isReputable(signal: Signal): boolean {
  return signal.confidence >= 0.7;
}

// Determine source type from signal
function getSourceType(signal: Signal): typeof LIVE_SOURCES[number] {
  const platform = signal.platform?.toLowerCase() || "";
  if (platform.includes("twitter") || platform.includes("x.com")) return LIVE_SOURCES[0];
  if (platform.includes("youtube")) return LIVE_SOURCES[1];
  if (platform.includes("coindesk") || platform.includes("block") || platform.includes("decrypt")) return LIVE_SOURCES[2];
  return LIVE_SOURCES[3];
}

export default async function FeedsPage() {
  const allSignals = await safe<Signal[]>(feedApi.signals(50), []);

  // Filter to only show reputable signals
  const signals = allSignals.filter(isReputable);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Signal Feed</h1>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
        </div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Back
        </Link>
      </div>

      {/* Live Sources */}
      <div className="neo-raised p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Live Sources
          </h3>
          <span className="text-xs text-muted">
            {LIVE_SOURCES.reduce((acc, s) => acc + s.accounts.length, 0)} accounts monitored
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {LIVE_SOURCES.map((source) => (
            <div key={source.id} className="neo-pressed p-3 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-lg ${source.color}`}>{source.icon}</span>
                  <span className="text-sm font-medium">{source.name}</span>
                </div>
                <span className="text-[10px] text-muted neo-raised-sm px-1.5 py-0.5 rounded">
                  {source.accounts.length}
                </span>
              </div>
              <div className="text-[10px] text-muted truncate">
                {source.accounts.slice(0, 3).join(", ")}
                {source.accounts.length > 3 && ` +${source.accounts.length - 3}`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* New Signal Form */}
      <NewSignalForm />

      {/* Subscription Banner */}
      <div className="neo-raised p-4 flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="text-muted">Subscription:</span>
          <span className="neo-raised-sm px-2 py-1 text-xs font-semibold">FREE</span>
          <span className="text-xs text-muted">5 min delay</span>
        </div>
        <Link href="/pricing" className="text-accent hover:underline text-sm">
          Upgrade for real-time →
        </Link>
      </div>

      {/* Reputable Signals Section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Verified Signals</h2>
            <span className="neo-raised-sm px-2 py-0.5 text-[10px] font-medium text-green-500 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              HIGH CONFIDENCE
            </span>
          </div>
          <span className="text-xs text-muted">{signals.length} signals</span>
        </div>

        {signals.length === 0 ? (
          <NeoCard className="text-center text-muted py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full neo-pressed flex items-center justify-center">
                <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-foreground">No verified signals yet</p>
                <p className="text-sm">High-confidence signals (70%+) will appear here.</p>
                <p className="text-sm mt-2">Submit your own using the form above!</p>
              </div>
            </div>
          </NeoCard>
        ) : (
          <div className="flex flex-col gap-3">
            {signals.map((signal) => {
              const source = getSourceType(signal);
              return (
              <NeoCard key={signal.id} className="p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Source Icon */}
                      <span className={`text-lg ${source.color}`} title={source.name}>{source.icon}</span>
                      <span className="text-xl font-semibold">{signal.ticker}</span>
                      <NeoBadge tone={toneFor(signal.direction)}>
                        {signal.direction.toUpperCase()}
                      </NeoBadge>
                      <span className="neo-raised-sm px-2 py-0.5 text-[10px] font-medium text-muted">
                        {signal.platform}
                      </span>
                      {/* Verified Badge */}
                      <span className="flex items-center gap-1 text-green-500">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted">
                      <span>{timeAgo(signal.published_at)}</span>
                    </div>
                  </div>

                  {signal.headline_quote && (
                    <p className="text-sm text-muted">"{signal.headline_quote}"</p>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <span>
                        Entry: <span className="font-semibold text-foreground">${fmtNum(signal.entry_price)}</span>
                      </span>
                      <span>
                        Confidence: <span className="font-semibold text-green-500">{Math.round(signal.confidence * 100)}%</span>
                      </span>
                    </div>
                    {signal.execution_priority && (
                      <div className="flex items-center gap-1 text-xs text-muted">
                        Execute:
                        {signal.execution_priority.map((p, i) => (
                          <span key={p} className="neo-pressed px-1.5 py-0.5 rounded text-[10px]">
                            {i + 1}. {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </NeoCard>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

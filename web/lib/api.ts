export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3460";

export type Trade = {
  trade_id: string;
  thesis_id?: string;
  ticker: string;
  platform: string;
  direction: "long" | "short" | string;
  status: "open" | "closed" | "expired" | string;
  opened_at?: string;
  current_price?: number;
  author_price?: number;
  posted_price?: number;
  author_pnl?: number;
  posted_pnl?: number;
  headline_quote?: string;
  author?: string;
  author_handle?: string;
  source_url?: string;
  source_date?: string;
  [k: string]: unknown;
};

export type Stats = Record<string, unknown> & {
  total?: number;
  open?: number;
  closed?: number;
  total_pnl?: number;
  win_rate?: number;
};

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  trades: async (status?: "open" | "closed" | "expired"): Promise<Trade[]> => {
    const qs = status ? `?status=${status}` : "";
    const json = await getJSON<{ trades: Trade[] }>(`/trades${qs}`);
    return json.trades ?? [];
  },
  trade: async (id: string): Promise<Trade> => {
    const json = await getJSON<{ trade: Trade }>(`/trades/${id}`);
    return json.trade;
  },
  stats: async (): Promise<Stats> => {
    const json = await getJSON<{ stats: Stats }>(`/stats`);
    return json.stats ?? {};
  },
  process: async (input: string) => {
    const res = await fetch(`${API_BASE}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });
    if (!res.ok) throw new Error(`process → ${res.status}`);
    return res.json() as Promise<{ run_id: string; stream_url: string }>;
  },
  closeTrade: async (id: string, token?: string) => {
    const res = await fetch(`${API_BASE}/trades/${id}/close`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error(`close → ${res.status}`);
    return res.json();
  },
  streamUrl: (runId: string) => `${API_BASE}/stream/${runId}`,
};

export type StreamEvent = {
  type: string;
  thesis_id?: string;
  data?: Record<string, unknown>;
  timestamp: string;
};

export type Signal = {
  id: string;
  ticker: string;
  direction: "long" | "short" | string;
  platform: string;
  confidence: number;
  entry_price: number;
  headline_quote?: string;
  execution_priority?: string[];
  published_at: string;
  delayed_until?: string;
};

export const feedApi = {
  signals: async (limit = 50): Promise<Signal[]> => {
    const json = await getJSON<{ signals: Signal[] }>(`/signals?limit=${limit}`);
    return json.signals ?? [];
  },
};

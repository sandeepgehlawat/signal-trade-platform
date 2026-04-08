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

export type NewsItem = {
  id: string;
  headline: string;
  summary?: string;
  source: string;
  source_type: "twitter" | "youtube" | "news" | "custom";
  author?: string;
  author_handle?: string;
  author_avatar?: string;
  url?: string;
  sentiment?: "bullish" | "bearish" | "neutral";
  assets?: string[];
  published_at: string;
};

export type MockTrade = {
  id: string;
  user_name: string;
  user_avatar?: string;
  news_id?: string;
  news_headline?: string;
  ticker: string;
  direction: "long" | "short" | string;
  platform: string;
  entry_price: number;
  exit_price?: number;
  pnl_usd: number;
  pnl_pct: number;
  position_size: number;
  traded_at: string;
  closed_at?: string;
};

export const feedApi = {
  signals: async (limit = 50): Promise<Signal[]> => {
    const json = await getJSON<{ signals: Signal[] }>(`/signals?limit=${limit}`);
    return json.signals ?? [];
  },
  news: async (limit = 50): Promise<NewsItem[]> => {
    const json = await getJSON<{ news: NewsItem[] }>(`/news?limit=${limit}`);
    return json.news ?? [];
  },
  mockTrades: async (limit = 50): Promise<MockTrade[]> => {
    const json = await getJSON<{ mock_trades: MockTrade[] }>(`/mock-trades?limit=${limit}`);
    return json.mock_trades ?? [];
  },
};

// ============================================================================
// API KEYS
// ============================================================================

export type ApiKey = {
  id: string;
  key?: string; // Only present when creating (shown once)
  key_masked?: string;
  tier: "free" | "paid";
  user_id: string;
  created_at: string;
  last_used_at?: string;
  is_active: boolean;
};

export type Subscription = {
  id: string;
  tier: "free" | "paid";
  status: "active" | "cancelled" | "expired";
  amount_cents: number;
  billing_period: "weekly" | "monthly";
  started_at: string;
  expires_at?: string;
};

export const keysApi = {
  create: async (userId?: string, tier: "free" | "paid" = "free"): Promise<{
    key: ApiKey;
    warning: string;
  }> => {
    const res = await fetch(`${API_BASE}/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, tier }),
    });
    if (!res.ok) throw new Error(`create key → ${res.status}`);
    return res.json();
  },

  list: async (userId: string): Promise<ApiKey[]> => {
    const json = await getJSON<{ keys: ApiKey[] }>(`/keys/${userId}`);
    return json.keys ?? [];
  },

  revoke: async (keyId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/keys/${keyId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`revoke key → ${res.status}`);
  },
};

export const subscriptionApi = {
  get: async (userId: string): Promise<{ subscription: Subscription | null; tier: string }> => {
    return getJSON(`/subscribe/${userId}`);
  },

  create: async (userId: string, tier: "free" | "paid" = "paid", billingPeriod: "weekly" | "monthly" = "weekly"): Promise<{ subscription: Subscription }> => {
    const res = await fetch(`${API_BASE}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, tier, billing_period: billingPeriod }),
    });
    if (!res.ok) throw new Error(`create subscription → ${res.status}`);
    return res.json();
  },
};

// ============================================================================
// AUTH
// ============================================================================

export type User = {
  id: string;
  email: string;
};

export const authApi = {
  // Get current user (from session cookie)
  me: async (): Promise<User | null> => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user;
    } catch {
      return null;
    }
  },

  // Logout
  logout: async (): Promise<void> => {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  },

  // Get Google OAuth URL
  getGoogleAuthUrl: async (): Promise<string> => {
    const res = await fetch(`${API_BASE}/auth/google`, {
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error("Failed to get auth URL");
    }
    const data = await res.json();
    return data.url;
  },
};

// Update keysApi to use credentials
export const keysApiAuth = {
  create: async (tier: "free" | "paid" = "free"): Promise<{
    key: ApiKey;
    warning: string;
  }> => {
    const res = await fetch(`${API_BASE}/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tier }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `create key → ${res.status}`);
    }
    return res.json();
  },

  list: async (userId: string): Promise<ApiKey[]> => {
    const res = await fetch(`${API_BASE}/keys/${userId}`, {
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `list keys → ${res.status}`);
    }
    const json = await res.json();
    return json.keys ?? [];
  },

  revoke: async (keyId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/keys/${keyId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error(`revoke key → ${res.status}`);
  },
};

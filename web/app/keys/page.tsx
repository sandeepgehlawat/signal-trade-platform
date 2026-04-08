"use client";

import { useState, useEffect } from "react";
import { NeoCard, NeoButton, NeoBadge } from "@/components/Neo";
import { authApi, keysApiAuth, subscriptionApi, type ApiKey, type Subscription, type User, API_BASE } from "@/lib/api";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="neo-button px-3 py-1 text-xs font-medium"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for error in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get("error");
    if (urlError) {
      setError(decodeURIComponent(urlError));
      // Clean up URL
      window.history.replaceState({}, "", "/keys");
    }
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/google`, { credentials: "include" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        setError(data.error);
        setLoading(false);
      }
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16 flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">Sign in to Signal Trade</h1>
        <p className="text-sm text-muted">
          Sign in to manage your API keys and subscription
        </p>
      </div>

      <NeoCard className="p-6 flex flex-col gap-4">
        {error && (
          <div className="text-sm text-red-500 bg-red-500/10 p-3 rounded-lg">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="neo-button flex items-center justify-center gap-3 px-4 py-3 text-sm font-medium w-full"
        >
          <GoogleIcon />
          {loading ? "Redirecting..." : "Continue with Google"}
        </button>

        <p className="text-xs text-muted text-center">
          By signing in, you agree to our Terms of Service
        </p>
      </NeoCard>
    </div>
  );
}

function KeysDashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [user.id]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [keysData, subData] = await Promise.all([
        keysApiAuth.list(user.id).catch(() => []),
        subscriptionApi.get(user.id).catch(() => ({ subscription: null, tier: "free" })),
      ]);
      setKeys(keysData);
      setSubscription(subData.subscription);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateKey() {
    setCreating(true);
    setError(null);
    setNewKey(null);
    try {
      const result = await keysApiAuth.create("free");
      setNewKey(result.key.key!);
      await loadData();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevokeKey(keyId: string) {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    try {
      await keysApiAuth.revoke(keyId);
      await loadData();
    } catch (e) {
      setError(String(e));
    }
  }

  const tier = subscription?.status === "active" ? subscription.tier : "free";

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      {/* Header */}
      <section className="neo-raised p-6 sm:p-8 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-semibold">API Keys</h1>
            <NeoBadge tone={tier === "paid" ? "bull" : "neutral"}>
              {tier === "paid" ? "Pro" : "Free"}
            </NeoBadge>
          </div>
          <button
            onClick={onLogout}
            className="text-sm text-muted hover:text-foreground"
          >
            Sign out
          </button>
        </div>
        <p className="text-sm text-muted leading-relaxed">
          Generate API keys to connect your Signal Trade Bot to the platform.
          {tier === "free" && " Free tier has 5 minute signal delay. Upgrade for real-time access."}
        </p>
        <div className="text-xs text-muted font-mono bg-muted/10 px-3 py-2 rounded-lg">
          {user.email}
        </div>
      </section>

      {/* New Key Warning */}
      {newKey && (
        <section className="neo-raised p-6 border-2 border-accent/50 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-accent text-xl">!</span>
            <h2 className="text-lg font-semibold">Save Your API Key Now</h2>
          </div>
          <p className="text-sm text-muted">
            This is the only time you'll see this key. Copy it now and add it to your
            <code className="mx-1 px-1.5 py-0.5 bg-muted/20 rounded text-xs">~/.signal-trade/credentials.env</code>
            file.
          </p>
          <div className="flex items-center gap-3 bg-muted/10 p-4 rounded-xl">
            <code className="flex-1 text-sm font-mono break-all">{newKey}</code>
            <CopyButton text={newKey} />
          </div>
          <div className="text-xs text-muted bg-muted/10 p-3 rounded-lg">
            <strong>Add to credentials.env:</strong>
            <pre className="mt-2 overflow-x-auto">SIGNAL_TRADE_API_KEY={newKey}</pre>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="self-start text-sm text-muted hover:text-foreground"
          >
            I've saved it, dismiss this
          </button>
        </section>
      )}

      {/* Error */}
      {error && (
        <div className="neo-raised p-4 border-2 border-red-500/50 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Generate Key */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your API Keys</h2>
          <NeoButton onClick={handleCreateKey} disabled={creating}>
            {creating ? "Generating..." : "Generate New Key"}
          </NeoButton>
        </div>

        {loading ? (
          <NeoCard className="text-center text-muted py-8">Loading...</NeoCard>
        ) : keys.length === 0 ? (
          <NeoCard className="text-center text-muted py-8">
            No API keys yet. Click "Generate New Key" to create one.
          </NeoCard>
        ) : (
          <div className="flex flex-col gap-3">
            {keys.map((key) => (
              <NeoCard key={key.id} className="flex items-center justify-between p-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">
                      st_live_****{key.id.slice(-8)}
                    </code>
                    <NeoBadge tone={key.is_active ? "bull" : "bear"}>
                      {key.is_active ? "Active" : "Revoked"}
                    </NeoBadge>
                    <NeoBadge tone={key.tier === "paid" ? "bull" : "neutral"}>
                      {key.tier}
                    </NeoBadge>
                  </div>
                  <span className="text-xs text-muted">
                    Created: {new Date(key.created_at).toLocaleDateString()}
                    {key.last_used_at && ` · Last used: ${new Date(key.last_used_at).toLocaleDateString()}`}
                  </span>
                </div>
                {key.is_active && (
                  <button
                    onClick={() => handleRevokeKey(key.id)}
                    className="text-xs text-red-500 hover:text-red-400"
                  >
                    Revoke
                  </button>
                )}
              </NeoCard>
            ))}
          </div>
        )}
      </section>

      {/* Subscription Info */}
      <section className="neo-raised p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Subscription</h2>
        {subscription && subscription.status === "active" ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <NeoBadge tone="bull">Pro</NeoBadge>
              <span className="text-sm">Real-time signals, 5 connections</span>
            </div>
            <span className="text-xs text-muted">
              Expires: {subscription.expires_at ? new Date(subscription.expires_at).toLocaleDateString() : "Never"}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              Free tier: 5 minute signal delay, 1 connection, 50 signals/day
            </p>
            <a
              href="/pricing"
              className="neo-button inline-flex items-center justify-center px-4 py-2 text-sm font-medium w-fit"
            >
              Upgrade to Pro - $5/week
            </a>
          </div>
        )}
      </section>

      {/* Setup Instructions */}
      <section className="neo-raised p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Quick Setup</h2>
        <div className="text-sm text-muted leading-relaxed space-y-4">
          <p>Add your API key to the Signal Trade skill configuration:</p>
          <div className="bg-muted/10 p-4 rounded-xl overflow-x-auto">
            <pre className="text-xs font-mono whitespace-pre">{`# ~/.signal-trade/credentials.env

# Platform connection
SIGNAL_TRADE_URL=http://localhost:3460
SIGNAL_TRADE_API_KEY=st_live_your_key_here

# Exchange credentials (your own keys)
HL_PRIVATE_KEY=0x...
PM_PRIVATE_KEY=0x...
OKX_API_KEY=...

# Settings
PAPER_MODE=true
RISK_CAPITAL=1000
MAX_POSITION_PCT=5`}</pre>
          </div>
          <p className="text-xs">
            Then run <code className="px-1.5 py-0.5 bg-muted/20 rounded">/signal-trade</code> in
            Claude Code to start monitoring for signals.
          </p>
        </div>
      </section>
    </div>
  );
}

export default function KeysPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    setLoading(true);
    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await authApi.logout();
    setUser(null);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-muted">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return <KeysDashboard user={user} onLogout={handleLogout} />;
}

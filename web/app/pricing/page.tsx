"use client";

import { useState } from "react";
import Link from "next/link";
import { NeoCard, NeoButton } from "@/components/Neo";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3460";

const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with delayed signals",
    features: [
      "5 minute signal delay",
      "1 connection limit",
      "50 signals per day",
      "Basic signal data",
      "Community support",
    ],
    cta: "Get Started",
    highlighted: false,
    isPaid: false,
  },
  {
    name: "Pro",
    price: "$5",
    period: "per week",
    description: "Real-time signals for serious traders",
    features: [
      "Real-time signals (no delay)",
      "5 concurrent connections",
      "Unlimited signals",
      "Full signal metadata",
      "Execution priority hints",
      "API access",
      "Priority support",
    ],
    cta: "Upgrade to Pro",
    highlighted: true,
    isPaid: true,
  },
];

const CHAINS = [
  { id: "polygon", name: "Polygon", icon: "🟣" },
  { id: "xlayer", name: "X Layer", icon: "⭕" },
  { id: "solana", name: "Solana", icon: "🟢" },
];

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

interface PaymentInfo {
  id: string;
  chain: string;
  amountUsdc: number;
  depositAddress: string;
  memo: string;
  expiresAt: string;
}

export default function PricingPage() {
  const [showPayment, setShowPayment] = useState(false);
  const [selectedChain, setSelectedChain] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const handleUpgrade = () => {
    setShowPayment(true);
    setError("");
  };

  const handleCreatePayment = async () => {
    if (!selectedChain) {
      setError("Please select a payment network");
      return;
    }

    const userIdToUse = userId.trim() || `user_${Date.now()}`;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/payments/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userIdToUse,
          chain: selectedChain,
          period: "weekly",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create payment");
      }

      setPayment(data.payment);
      setUserId(userIdToUse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create payment");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleFreeStart = () => {
    window.location.href = "/feeds";
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      {/* Header */}
      <div className="text-center flex flex-col gap-4">
        <div className="flex items-center justify-center gap-2">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Back
          </Link>
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold">Simple Pricing</h1>
        <p className="text-muted max-w-xl mx-auto">
          Start free with delayed signals. Upgrade for real-time access and unlimited connections.
        </p>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <NeoCard className="max-w-md w-full p-6 flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Upgrade to Pro</h2>
              <button
                onClick={() => { setShowPayment(false); setPayment(null); }}
                className="text-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {!payment ? (
              <>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Your User ID (optional)</label>
                    <input
                      type="text"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      placeholder="Leave blank for auto-generated"
                      className="w-full px-3 py-2 border rounded-lg bg-background"
                    />
                    <p className="text-xs text-muted mt-1">Used to link your subscription to API keys</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Select Payment Network</label>
                    <div className="grid grid-cols-3 gap-2">
                      {CHAINS.map((chain) => (
                        <button
                          key={chain.id}
                          onClick={() => setSelectedChain(chain.id)}
                          className={`p-3 rounded-lg border text-center transition-all ${
                            selectedChain === chain.id
                              ? "border-accent bg-accent/10"
                              : "border-border hover:border-accent/50"
                          }`}
                        >
                          <span className="text-2xl block mb-1">{chain.icon}</span>
                          <span className="text-xs">{chain.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {error && (
                  <p className="text-red-500 text-sm">{error}</p>
                )}

                <NeoButton
                  onClick={handleCreatePayment}
                  disabled={loading}
                  className="w-full justify-center"
                >
                  {loading ? "Creating..." : "Continue to Payment"}
                </NeoButton>

                <p className="text-xs text-muted text-center">
                  Pay $5 USDC for 1 week of Pro access
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-4">
                  <div className="text-center py-4 bg-accent/10 rounded-lg">
                    <p className="text-sm text-muted">Send exactly</p>
                    <p className="text-3xl font-bold">${payment.amountUsdc.toFixed(2)} USDC</p>
                    <p className="text-sm text-muted">on {CHAINS.find(c => c.id === payment.chain)?.name}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">To Address</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-muted/20 rounded text-sm break-all">
                        {payment.depositAddress}
                      </code>
                      <button
                        onClick={() => copyToClipboard(payment.depositAddress, "address")}
                        className="p-2 hover:bg-muted/20 rounded"
                      >
                        {copied === "address" ? "✓" : <CopyIcon />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Reference (Memo)</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-muted/20 rounded text-sm">
                        {payment.memo}
                      </code>
                      <button
                        onClick={() => copyToClipboard(payment.memo, "memo")}
                        className="p-2 hover:bg-muted/20 rounded"
                      >
                        {copied === "memo" ? "✓" : <CopyIcon />}
                      </button>
                    </div>
                  </div>

                  <div className="text-sm text-muted space-y-1">
                    <p>✓ Send the <strong>exact amount</strong> shown above</p>
                    <p>✓ Payment detected automatically in 1-2 minutes</p>
                    <p>✓ Your user ID: <code className="bg-muted/20 px-1 rounded">{userId}</code></p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <NeoButton
                    onClick={() => { setPayment(null); setSelectedChain(null); }}
                    className="flex-1 justify-center"
                  >
                    ← Change Network
                  </NeoButton>
                  <NeoButton
                    onClick={() => window.open(`/payments/user/${userId}`, "_blank")}
                    className="flex-1 justify-center"
                  >
                    Check Status →
                  </NeoButton>
                </div>
              </>
            )}
          </NeoCard>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {TIERS.map((tier) => (
          <NeoCard
            key={tier.name}
            className={`p-6 flex flex-col gap-6 ${
              tier.highlighted ? "ring-2 ring-accent" : ""
            }`}
          >
            {tier.highlighted && (
              <span className="neo-raised-sm px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-accent self-start">
                Most Popular
              </span>
            )}

            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold">{tier.name}</h2>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">{tier.price}</span>
                <span className="text-muted">/{tier.period}</span>
              </div>
              <p className="text-sm text-muted">{tier.description}</p>
            </div>

            <ul className="flex flex-col gap-3 flex-1">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm">
                  <CheckIcon />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <NeoButton
              onClick={tier.isPaid ? handleUpgrade : handleFreeStart}
              className="w-full justify-center"
            >
              {tier.cta}
            </NeoButton>
          </NeoCard>
        ))}
      </div>

      {/* Payment Methods */}
      <div className="flex flex-col gap-4 items-center">
        <p className="text-sm text-muted">Accepted Payment Methods</p>
        <div className="flex gap-4">
          {CHAINS.map((chain) => (
            <div key={chain.id} className="flex items-center gap-2 neo-raised-sm px-4 py-2">
              <span>{chain.icon}</span>
              <span className="text-sm">{chain.name} USDC</span>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="flex flex-col gap-6 mt-8">
        <h2 className="text-xl font-semibold text-center">Frequently Asked Questions</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NeoCard className="p-4">
            <h3 className="font-semibold mb-2">How do I pay?</h3>
            <p className="text-sm text-muted">
              Send USDC to our deposit address on Polygon, X Layer, or Solana.
              Your subscription activates automatically within 1-2 minutes.
            </p>
          </NeoCard>

          <NeoCard className="p-4">
            <h3 className="font-semibold mb-2">What sources do you support?</h3>
            <p className="text-sm text-muted">
              We extract signals from Twitter/X, YouTube, news articles, and direct text input.
              Our AI analyzes content and extracts actionable trading theses.
            </p>
          </NeoCard>

          <NeoCard className="p-4">
            <h3 className="font-semibold mb-2">Can I cancel anytime?</h3>
            <p className="text-sm text-muted">
              Yes! Pro subscriptions are billed weekly. Simply don&apos;t renew to cancel.
              Your access continues until the end of the billing period.
            </p>
          </NeoCard>

          <NeoCard className="p-4">
            <h3 className="font-semibold mb-2">What&apos;s the signal delay?</h3>
            <p className="text-sm text-muted">
              Free tier signals are delayed by 5 minutes. Pro subscribers receive
              signals instantly as they&apos;re published.
            </p>
          </NeoCard>
        </div>
      </div>
    </div>
  );
}

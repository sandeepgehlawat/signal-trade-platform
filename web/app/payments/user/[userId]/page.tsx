"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { NeoCard, NeoButton } from "@/components/Neo";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3460";

interface Payment {
  id: string;
  chain: string;
  amount: number;
  status: "pending" | "confirming" | "completed" | "expired";
  createdAt: string;
  txHash?: string;
}

interface Subscription {
  tier: "free" | "paid";
  expiresAt?: string;
}

const CHAIN_INFO: Record<string, { name: string; icon: string; explorer: string }> = {
  polygon: { name: "Polygon", icon: "🟣", explorer: "https://polygonscan.com/tx/" },
  xlayer: { name: "X Layer", icon: "⭕", explorer: "https://www.okx.com/explorer/xlayer/tx/" },
  solana: { name: "Solana", icon: "🟢", explorer: "https://solscan.io/tx/" },
};

function StatusBadge({ status }: { status: Payment["status"] }) {
  const styles: Record<Payment["status"], string> = {
    pending: "bg-yellow-500/20 text-yellow-500",
    confirming: "bg-blue-500/20 text-blue-500",
    completed: "bg-green-500/20 text-green-500",
    expired: "bg-red-500/20 text-red-500",
  };

  const labels: Record<Payment["status"], string> = {
    pending: "Waiting for Payment",
    confirming: "Confirming...",
    completed: "Completed",
    expired: "Expired",
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function PaymentStatusPage() {
  const params = useParams();
  const userId = params.userId as string;
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchPayments = async () => {
    try {
      const response = await fetch(`${API_URL}/payments/user/${userId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch payments");
      }

      setPayments(data.recentPayments || []);
      setSubscription(data.subscription || null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch payments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    // Poll every 30 seconds for status updates
    const interval = setInterval(fetchPayments, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Link href="/pricing" className="text-sm text-muted hover:text-foreground">
            ← Back to Pricing
          </Link>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold">Payment Status</h1>
        <p className="text-muted">
          User ID: <code className="bg-muted/20 px-2 py-1 rounded">{userId}</code>
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <NeoCard className="p-8 text-center">
          <p className="text-muted">Loading payments...</p>
        </NeoCard>
      )}

      {/* Error State */}
      {error && (
        <NeoCard className="p-8 text-center">
          <p className="text-red-500">{error}</p>
          <NeoButton onClick={fetchPayments} className="mt-4">
            Retry
          </NeoButton>
        </NeoCard>
      )}

      {/* Subscription Status */}
      {!loading && !error && subscription && (
        <NeoCard className={`p-6 ${subscription.tier === "paid" ? "ring-2 ring-green-500" : ""}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Subscription Status</h2>
              <p className="text-muted">
                {subscription.tier === "paid" ? "Pro Subscriber" : "Free Tier"}
              </p>
            </div>
            <span className={`px-4 py-2 rounded-full font-medium ${
              subscription.tier === "paid"
                ? "bg-green-500/20 text-green-500"
                : "bg-muted/20 text-muted"
            }`}>
              {subscription.tier === "paid" ? "Active" : "Free"}
            </span>
          </div>
          {subscription.expiresAt && (
            <p className="text-sm text-muted mt-2">
              Expires: {new Date(subscription.expiresAt).toLocaleDateString()}
            </p>
          )}
        </NeoCard>
      )}

      {/* No Payments */}
      {!loading && !error && payments.length === 0 && (
        <NeoCard className="p-8 text-center">
          <p className="text-muted mb-4">No payments found for this user ID.</p>
          <Link href="/pricing">
            <NeoButton>Go to Pricing</NeoButton>
          </Link>
        </NeoCard>
      )}

      {/* Payment List */}
      {!loading && !error && payments.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Recent Payments</h2>
          {payments.map((payment) => {
            const chain = CHAIN_INFO[payment.chain] || { name: payment.chain, icon: "💰", explorer: "" };

            return (
              <NeoCard key={payment.id} className="p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{chain.icon}</span>
                    <span className="font-medium">{chain.name}</span>
                  </div>
                  <StatusBadge status={payment.status} />
                </div>

                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">Amount</span>
                    <span className="font-mono font-medium">${payment.amount.toFixed(2)} USDC</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted">Created</span>
                    <span>{formatDate(payment.createdAt)}</span>
                  </div>

                  {payment.txHash && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted">Transaction</span>
                      {chain.explorer ? (
                        <a
                          href={`${chain.explorer}${payment.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline font-mono text-xs"
                        >
                          {payment.txHash.slice(0, 8)}...{payment.txHash.slice(-6)}
                        </a>
                      ) : (
                        <span className="font-mono text-xs">
                          {payment.txHash.slice(0, 8)}...{payment.txHash.slice(-6)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Completed Success Message */}
                {payment.status === "completed" && (
                  <div className="mt-2 p-4 bg-green-500/10 rounded-lg">
                    <p className="text-sm text-green-500 font-medium">
                      Payment confirmed! Your Pro subscription is now active.
                    </p>
                  </div>
                )}
              </NeoCard>
            );
          })}

          {/* Refresh Button */}
          <NeoButton onClick={fetchPayments} className="self-center">
            Refresh Status
          </NeoButton>
        </div>
      )}

      {/* Help Text */}
      <div className="text-center text-sm text-muted">
        <p>Payments are monitored automatically.</p>
        <p>This page refreshes every 30 seconds.</p>
      </div>
    </div>
  );
}

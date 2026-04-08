/**
 * Signal Trade - Solana Monitor
 *
 * Monitors USDC transfers on Solana
 */

import { PAYMENT_CONFIG } from "../config";
import { getPendingPayments, confirmPayment, markPaymentConfirming } from "../storage";
import { activateSubscription } from "../subscription";

const USDC_MINT = PAYMENT_CONFIG.chains.solana.usdc.mint;

interface TokenTransfer {
  amount: string;
  mint: string;
  source: string;
  destination: string;
}

interface SolanaTransaction {
  signature: string;
  slot: number;
  meta: {
    preTokenBalances: any[];
    postTokenBalances: any[];
    err: any;
  };
  transaction: {
    message: {
      accountKeys: string[];
    };
  };
}

/**
 * Get recent signatures for the deposit wallet
 */
async function getRecentSignatures(limit = 20): Promise<string[]> {
  const rpcUrl = PAYMENT_CONFIG.chains.solana.rpcUrl;
  const depositWallet = PAYMENT_CONFIG.depositWallets.solana;

  if (!depositWallet) {
    return [];
  }

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [
          depositWallet,
          { limit },
        ],
      }),
    });

    const result = await response.json();

    if (result.error) {
      // Silently ignore rate limit errors
      return [];
    }

    return (result.result || []).map((sig: any) => sig.signature);
  } catch (error) {
    console.error("[monitor:solana] Error fetching signatures:", error);
    return [];
  }
}

/**
 * Get transaction details
 */
async function getTransaction(signature: string): Promise<SolanaTransaction | null> {
  const rpcUrl = PAYMENT_CONFIG.chains.solana.rpcUrl;

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [
          signature,
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
        ],
      }),
    });

    const result = await response.json();
    return result.result;
  } catch (error) {
    console.error("[monitor:solana] Error fetching transaction:", error);
    return null;
  }
}

/**
 * Parse USDC transfers from a transaction
 */
function parseUsdcTransfers(tx: SolanaTransaction): TokenTransfer[] {
  const transfers: TokenTransfer[] = [];
  const depositWallet = PAYMENT_CONFIG.depositWallets.solana.toLowerCase();

  if (!tx.meta || tx.meta.err) {
    return transfers;
  }

  const preBalances = tx.meta.preTokenBalances || [];
  const postBalances = tx.meta.postTokenBalances || [];

  // Find USDC balance changes
  for (const post of postBalances) {
    if (post.mint !== USDC_MINT) continue;

    const pre = preBalances.find(
      (p: any) => p.accountIndex === post.accountIndex && p.mint === USDC_MINT
    );

    const preAmount = pre ? BigInt(pre.uiTokenAmount?.amount || "0") : BigInt(0);
    const postAmount = BigInt(post.uiTokenAmount?.amount || "0");

    // Check if this is a deposit to our wallet
    const owner = post.owner?.toLowerCase();
    if (owner === depositWallet && postAmount > preAmount) {
      const amountReceived = postAmount - preAmount;
      transfers.push({
        amount: amountReceived.toString(),
        mint: post.mint,
        source: "", // Could trace this if needed
        destination: post.owner,
      });
    }
  }

  return transfers;
}

/**
 * Match payment by amount
 */
function matchPaymentByAmount(amount: number): { paymentId: string; userId: string } | null {
  const pendingPayments = getPendingPayments();

  for (const payment of pendingPayments) {
    if (payment.chain === "solana") {
      if (Math.abs(payment.amountUsdc - amount) < 0.001) {
        return { paymentId: payment.id, userId: payment.userId };
      }
    }
  }

  return null;
}

// Track processed signatures to avoid duplicates
const processedSignatures = new Set<string>();

/**
 * Poll for new Solana transfers
 */
export async function pollSolana(): Promise<void> {
  try {
    const signatures = await getRecentSignatures(20);

    for (const signature of signatures) {
      // Skip already processed
      if (processedSignatures.has(signature)) {
        continue;
      }

      const tx = await getTransaction(signature);
      if (!tx) continue;

      const transfers = parseUsdcTransfers(tx);

      for (const transfer of transfers) {
        const amount = Number(transfer.amount) / 1_000_000; // USDC has 6 decimals

        console.log(`[monitor:solana] Detected USDC transfer: $${amount.toFixed(2)} tx:${signature.slice(0, 10)}...`);

        const match = matchPaymentByAmount(amount);

        if (match) {
          console.log(`[monitor:solana] Matched payment ${match.paymentId} for user ${match.userId}`);

          // Solana confirms quickly (1 confirmation is usually enough)
          markPaymentConfirming(match.paymentId, signature);

          // Confirm immediately for Solana (already finalized when we see it)
          setTimeout(async () => {
            try {
              confirmPayment(match.paymentId, signature);
              await activateSubscription(match.userId, "solana", signature);
              console.log(`[monitor:solana] Payment ${match.paymentId} confirmed!`);
            } catch (error) {
              console.error("[monitor:solana] Error confirming payment:", error);
            }
          }, 2000); // Small delay to ensure finality
        }
      }

      // Mark as processed
      processedSignatures.add(signature);

      // Keep set from growing too large
      if (processedSignatures.size > 1000) {
        const entries = Array.from(processedSignatures);
        entries.slice(0, 500).forEach((s) => processedSignatures.delete(s));
      }
    }
  } catch {
    // Silently ignore poll errors (rate limits, network issues)
  }
}

/**
 * Start Solana monitor
 */
export function startSolanaMonitor(): void {
  if (!PAYMENT_CONFIG.depositWallets.solana) {
    console.log("[monitor:solana] No deposit wallet configured, skipping");
    return;
  }

  console.log("[monitor:solana] Starting Solana monitor...");

  // Poll every 30 seconds (to avoid rate limits on public RPC)
  setInterval(pollSolana, 30000);

  console.log("[monitor:solana] Solana monitor started (30s interval)");
}

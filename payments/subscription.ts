/**
 * Signal Trade - Subscription Activation
 *
 * Activates paid subscriptions after payment confirmation
 */

import { saveSubscription, getActiveSubscription } from "../shared/storage";
import type { SupportedChain } from "./config";

/**
 * Activate a paid subscription for a user
 */
export async function activateSubscription(
  userId: string,
  chain: SupportedChain,
  txHash: string
): Promise<void> {
  // Check if user already has an active subscription
  const existing = getActiveSubscription(userId);

  // Calculate expiry (1 week from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const subscriptionId = `sub_${Date.now()}_${chain}`;

  // If existing subscription, extend it
  if (existing && existing.status === "active" && existing.expires_at) {
    const existingExpiry = new Date(existing.expires_at);
    if (existingExpiry > new Date()) {
      // Extend from current expiry
      expiresAt.setTime(existingExpiry.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
  }

  // Create/update subscription
  saveSubscription(
    subscriptionId,
    userId,
    "paid",
    500, // $5.00 in cents
    "weekly",
    expiresAt.toISOString()
  );

  console.log(`[subscription] Activated paid subscription for ${userId}`);
  console.log(`[subscription] Expires: ${expiresAt.toISOString()}`);
  console.log(`[subscription] Payment chain: ${chain}, tx: ${txHash}`);
}

/**
 * Check subscription status for a user
 */
export function checkSubscription(userId: string): {
  tier: "free" | "paid";
  expiresAt?: string;
  daysRemaining?: number;
} {
  const subscription = getActiveSubscription(userId);

  if (!subscription || subscription.status !== "active") {
    return { tier: "free" };
  }

  if (subscription.expires_at) {
    const expiresAt = new Date(subscription.expires_at);
    if (expiresAt < new Date()) {
      return { tier: "free" };
    }

    const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

    return {
      tier: "paid",
      expiresAt: subscription.expires_at,
      daysRemaining,
    };
  }

  return { tier: "paid" };
}

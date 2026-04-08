/**
 * Signal Trade - Payment API
 *
 * HTTP endpoints for creating and checking payment requests
 */

import { randomBytes } from "crypto";
import { PAYMENT_CONFIG, type SupportedChain, type PaymentRequest } from "./config";
import { createPayment, getPaymentById, getUserPayments, expireOldPayments } from "./storage";
import { checkSubscription } from "./subscription";

/**
 * Generate a unique payment amount
 * Adds small random cents to make amount unique for matching
 */
function generateUniqueAmount(baseAmount: number): number {
  // Add random cents from 0.01 to 0.99
  const randomCents = Math.floor(Math.random() * 99) / 100;
  return baseAmount + randomCents;
}

/**
 * Generate a unique memo/reference for the payment
 */
function generateMemo(): string {
  return `ST${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * Create a new payment request
 */
export function createPaymentRequest(
  userId: string,
  chain: SupportedChain,
  period: "weekly" | "monthly" = "weekly"
): PaymentRequest {
  // Expire old payments first
  expireOldPayments();

  const baseAmount = period === "weekly"
    ? PAYMENT_CONFIG.WEEKLY_PRICE_USD
    : PAYMENT_CONFIG.MONTHLY_PRICE_USD;

  // Generate unique amount for matching
  const uniqueAmount = generateUniqueAmount(baseAmount);

  const depositAddress = PAYMENT_CONFIG.depositWallets[chain];
  if (!depositAddress) {
    throw new Error(`No deposit wallet configured for ${chain}`);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAYMENT_CONFIG.paymentExpiryMs);

  const payment: PaymentRequest = {
    id: `pay_${Date.now()}_${randomBytes(4).toString("hex")}`,
    userId,
    chain,
    amount: baseAmount,
    amountUsdc: uniqueAmount,
    depositAddress,
    memo: generateMemo(),
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  createPayment(payment);

  return payment;
}

/**
 * Get payment details formatted for frontend display
 */
export function getPaymentDetails(paymentId: string) {
  const payment = getPaymentById(paymentId);
  if (!payment) return null;

  const chainConfig = PAYMENT_CONFIG.chains[payment.chain];

  return {
    ...payment,
    chainName: chainConfig.name,
    explorerUrl: payment.txHash
      ? `${chainConfig.explorerUrl}/tx/${payment.txHash}`
      : null,
    instructions: getPaymentInstructions(payment),
  };
}

/**
 * Get human-readable payment instructions
 */
function getPaymentInstructions(payment: PaymentRequest): string[] {
  const chain = PAYMENT_CONFIG.chains[payment.chain];

  const instructions = [
    `Send exactly $${payment.amountUsdc.toFixed(2)} USDC to:`,
    payment.depositAddress,
    "",
    `Network: ${chain.name}`,
    `Reference: ${payment.memo}`,
    "",
    "Important:",
    "• Send the exact amount shown (includes unique cents for verification)",
    "• Payment will be detected automatically within 1-2 minutes",
    `• This payment link expires in 24 hours`,
  ];

  if (payment.chain === "solana") {
    instructions.push("• Use Solana native USDC (not bridged tokens)");
  }

  return instructions;
}

/**
 * Get user's payment history and subscription status
 */
export function getUserPaymentStatus(userId: string) {
  const payments = getUserPayments(userId);
  const subscription = checkSubscription(userId);

  return {
    subscription,
    recentPayments: payments.slice(0, 5).map((p) => ({
      id: p.id,
      chain: p.chain,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt,
      txHash: p.txHash,
    })),
  };
}

/**
 * Get available payment chains with their deposit addresses
 */
export function getAvailableChains() {
  const chains: { chain: SupportedChain; name: string; available: boolean }[] = [];

  for (const [key, config] of Object.entries(PAYMENT_CONFIG.chains)) {
    const chain = key as SupportedChain;
    const hasWallet = !!PAYMENT_CONFIG.depositWallets[chain];

    chains.push({
      chain,
      name: config.name,
      available: hasWallet,
    });
  }

  return chains;
}

/**
 * Signal Trade - Payment Monitor
 *
 * Main entry point for starting all chain monitors
 */

import { startEvmMonitor } from "./monitors/evm";
import { startSolanaMonitor } from "./monitors/solana";
import { expireOldPayments } from "./storage";
import { PAYMENT_CONFIG } from "./config";

/**
 * Start all payment monitors
 */
export function startPaymentMonitors(): void {
  console.log("\n=== Payment Monitor Starting ===\n");

  // Show configured wallets
  console.log("Configured deposit wallets:");
  for (const [chain, address] of Object.entries(PAYMENT_CONFIG.depositWallets)) {
    if (address) {
      console.log(`  ${chain}: ${address.slice(0, 10)}...${address.slice(-6)}`);
    } else {
      console.log(`  ${chain}: NOT CONFIGURED`);
    }
  }
  console.log("");

  // Start EVM monitors (Polygon, X Layer)
  startEvmMonitor();

  // Start Solana monitor
  startSolanaMonitor();

  // Periodically expire old payment requests
  setInterval(() => {
    const expired = expireOldPayments();
    if (expired > 0) {
      console.log(`[monitor] Expired ${expired} old payment requests`);
    }
  }, 60 * 1000); // Check every minute

  console.log("\n=== Payment Monitor Ready ===\n");
}

// Export for use in API server
export * from "./api";
export * from "./config";
export { checkSubscription } from "./subscription";

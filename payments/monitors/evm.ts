/**
 * Signal Trade - EVM Chain Monitor
 *
 * Monitors USDC transfers on Polygon and X Layer
 */

import { PAYMENT_CONFIG, type SupportedChain } from "../config";
import { getPendingPayments, confirmPayment, markPaymentConfirming } from "../storage";
import { activateSubscription } from "../subscription";

// ERC20 Transfer event signature
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

interface TransferLog {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  blockNumber: string;
}

/**
 * Parse USDC amount from transfer data (6 decimals)
 */
function parseUsdcAmount(data: string): number {
  const amountHex = data.slice(2); // Remove 0x
  const amountWei = BigInt("0x" + amountHex);
  return Number(amountWei) / 1_000_000; // USDC has 6 decimals
}

/**
 * Parse address from topic (remove padding)
 */
function parseAddress(topic: string): string {
  return "0x" + topic.slice(26).toLowerCase();
}

/**
 * Fetch recent transfer logs for USDC contract
 */
async function fetchTransferLogs(
  chain: "polygon" | "xlayer",
  fromBlock: number,
  toBlock: number
): Promise<TransferLog[]> {
  const config = PAYMENT_CONFIG.chains[chain];
  const depositAddress = PAYMENT_CONFIG.depositWallets[chain].toLowerCase();

  if (!depositAddress) {
    console.warn(`[monitor:${chain}] No deposit wallet configured`);
    return [];
  }

  // Pad address to 32 bytes for topic filter
  const paddedAddress = "0x" + depositAddress.slice(2).padStart(64, "0");

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getLogs",
    params: [
      {
        fromBlock: "0x" + fromBlock.toString(16),
        toBlock: "0x" + toBlock.toString(16),
        address: config.usdc.address,
        topics: [
          TRANSFER_TOPIC,
          null, // from (any)
          paddedAddress, // to (our deposit address)
        ],
      },
    ],
  };

  try {
    const response = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (result.error) {
      console.error(`[monitor:${chain}] RPC error:`, result.error);
      return [];
    }

    return result.result || [];
  } catch (error) {
    console.error(`[monitor:${chain}] Fetch error:`, error);
    return [];
  }
}

/**
 * Get current block number
 */
async function getBlockNumber(chain: "polygon" | "xlayer"): Promise<number> {
  const config = PAYMENT_CONFIG.chains[chain];

  const response = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    }),
  });

  const result = await response.json();
  return parseInt(result.result, 16);
}

/**
 * Extract memo from transaction input data
 * Users include their payment memo in the transfer's input data
 */
async function getTransactionMemo(
  chain: "polygon" | "xlayer",
  txHash: string
): Promise<string | null> {
  const config = PAYMENT_CONFIG.chains[chain];

  try {
    const response = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionByHash",
        params: [txHash],
      }),
    });

    const result = await response.json();
    const tx = result.result;

    if (!tx || !tx.input) return null;

    // For simple transfers, memo might be in input data after the transfer call
    // Or we match by exact amount (simpler approach)
    return null;
  } catch {
    return null;
  }
}

/**
 * Match transfer to pending payment by amount
 * Since amounts are unique per payment request, we can match by amount
 */
function matchPaymentByAmount(
  chain: SupportedChain,
  amount: number
): { paymentId: string; userId: string } | null {
  const pendingPayments = getPendingPayments();

  for (const payment of pendingPayments) {
    if (payment.chain === chain) {
      // Match with small tolerance for floating point
      if (Math.abs(payment.amountUsdc - amount) < 0.001) {
        return { paymentId: payment.id, userId: payment.userId };
      }
    }
  }

  return null;
}

/**
 * Process detected transfers
 */
async function processTransfers(chain: "polygon" | "xlayer", logs: TransferLog[]): Promise<void> {
  for (const log of logs) {
    const amount = parseUsdcAmount(log.data);
    const txHash = log.transactionHash;

    console.log(`[monitor:${chain}] Detected USDC transfer: $${amount.toFixed(2)} tx:${txHash.slice(0, 10)}...`);

    // Match to pending payment
    const match = matchPaymentByAmount(chain, amount);

    if (match) {
      console.log(`[monitor:${chain}] Matched payment ${match.paymentId} for user ${match.userId}`);

      // Mark as confirming
      markPaymentConfirming(match.paymentId, txHash);

      // Wait for confirmations then confirm
      const config = PAYMENT_CONFIG.chains[chain];
      const requiredConfirmations = PAYMENT_CONFIG.confirmations[chain];

      setTimeout(async () => {
        try {
          const currentBlock = await getBlockNumber(chain);
          const txBlock = parseInt(log.blockNumber, 16);
          const confirmations = currentBlock - txBlock;

          if (confirmations >= requiredConfirmations) {
            confirmPayment(match.paymentId, txHash);
            await activateSubscription(match.userId, chain, txHash);
            console.log(`[monitor:${chain}] Payment ${match.paymentId} confirmed!`);
          }
        } catch (error) {
          console.error(`[monitor:${chain}] Error confirming payment:`, error);
        }
      }, requiredConfirmations * config.blockTime);
    }
  }
}

// Track last processed block per chain
const lastBlock: Record<string, number> = {};

/**
 * Poll for new transfers on a chain
 */
export async function pollChain(chain: "polygon" | "xlayer"): Promise<void> {
  try {
    const currentBlock = await getBlockNumber(chain);

    // Initialize last block if needed (start from current - 100)
    if (!lastBlock[chain]) {
      lastBlock[chain] = currentBlock - 100;
    }

    // Don't re-process same blocks
    if (currentBlock <= lastBlock[chain]) {
      return;
    }

    // Fetch logs from last processed to current
    const logs = await fetchTransferLogs(chain, lastBlock[chain] + 1, currentBlock);

    if (logs.length > 0) {
      await processTransfers(chain, logs);
    }

    lastBlock[chain] = currentBlock;
  } catch (error) {
    console.error(`[monitor:${chain}] Poll error:`, error);
  }
}

/**
 * Start monitoring EVM chains
 */
export function startEvmMonitor(): void {
  console.log("[monitor:evm] Starting EVM chain monitors...");

  // Poll Polygon every 5 seconds
  if (PAYMENT_CONFIG.depositWallets.polygon) {
    setInterval(() => pollChain("polygon"), 5000);
    console.log("[monitor:evm] Polygon monitor started");
  }

  // Poll X Layer every 5 seconds
  if (PAYMENT_CONFIG.depositWallets.xlayer) {
    setInterval(() => pollChain("xlayer"), 5000);
    console.log("[monitor:evm] X Layer monitor started");
  }
}

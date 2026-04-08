/**
 * Signal Trade - Payment Configuration
 *
 * USDC payment monitoring across multiple chains
 */

export const PAYMENT_CONFIG = {
  // Subscription pricing
  WEEKLY_PRICE_USD: 5,
  MONTHLY_PRICE_USD: 18, // ~10% discount

  // Supported chains
  chains: {
    polygon: {
      name: "Polygon",
      chainId: 137,
      rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      usdc: {
        address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Native USDC
        decimals: 6,
      },
      explorerUrl: "https://polygonscan.com",
      blockTime: 2000, // ~2 seconds
    },
    xlayer: {
      name: "X Layer",
      chainId: 196,
      rpcUrl: process.env.XLAYER_RPC_URL || "https://rpc.xlayer.tech",
      usdc: {
        address: "0x74b7F16337b8972027F6196A17a631aC6dE26d22", // USDC on X Layer
        decimals: 6,
      },
      explorerUrl: "https://www.okx.com/explorer/xlayer",
      blockTime: 3000,
    },
    solana: {
      name: "Solana",
      rpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      usdc: {
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        decimals: 6,
      },
      explorerUrl: "https://solscan.io",
      blockTime: 400,
    },
  },

  // Company deposit wallets (set in .env)
  // DEV ONLY: Using test addresses when not configured - replace in production!
  depositWallets: {
    polygon: process.env.DEPOSIT_WALLET_POLYGON || (process.env.NODE_ENV !== "production" ? "0x742d35Cc6634C0532925a3b844Bc9e7595f5bC11" : ""),
    xlayer: process.env.DEPOSIT_WALLET_XLAYER || (process.env.NODE_ENV !== "production" ? "0x742d35Cc6634C0532925a3b844Bc9e7595f5bC11" : ""),
    solana: process.env.DEPOSIT_WALLET_SOLANA || (process.env.NODE_ENV !== "production" ? "DRpbCBMxVnDK7maPMpE8mwqbRGgE3vZxMSKzGjkQrpAJ" : ""),
  },

  // Payment detection settings
  confirmations: {
    polygon: 5,
    xlayer: 5,
    solana: 1,
  },

  // How long payment requests are valid (24 hours)
  paymentExpiryMs: 24 * 60 * 60 * 1000,
};

export type SupportedChain = "polygon" | "xlayer" | "solana";

export interface PaymentRequest {
  id: string;
  userId: string;
  chain: SupportedChain;
  amount: number; // in USD
  amountUsdc: number; // in USDC (same as USD for stablecoin)
  depositAddress: string;
  memo: string; // unique identifier for this payment
  status: "pending" | "confirming" | "completed" | "expired";
  createdAt: string;
  expiresAt: string;
  txHash?: string;
  confirmedAt?: string;
}

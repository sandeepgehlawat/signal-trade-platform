/**
 * Signal Trade - Payment Storage
 *
 * SQLite storage for payment requests and confirmations
 * Uses bun:sqlite for native SQLite support
 */

import { Database } from "bun:sqlite";
import type { PaymentRequest, SupportedChain } from "./config";

const DB_PATH = process.env.DB_PATH || new URL("../signal-trade.db", import.meta.url).pathname;
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA busy_timeout = 5000");

// Create payments table
db.run(`
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    chain TEXT NOT NULL,
    amount REAL NOT NULL,
    amount_usdc REAL NOT NULL,
    deposit_address TEXT NOT NULL,
    memo TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    tx_hash TEXT,
    confirmed_at TEXT
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_payments_memo ON payments(memo)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id)`);

// Prepared statements
const insertPayment = db.prepare(`
  INSERT INTO payments (id, user_id, chain, amount, amount_usdc, deposit_address, memo, status, created_at, expires_at)
  VALUES ($id, $user_id, $chain, $amount, $amount_usdc, $deposit_address, $memo, $status, $created_at, $expires_at)
`);

const selectPaymentByMemo = db.prepare(`SELECT * FROM payments WHERE memo = ?`);
const selectPaymentById = db.prepare(`SELECT * FROM payments WHERE id = ?`);
const selectPendingPayments = db.prepare(`SELECT * FROM payments WHERE status = 'pending' AND expires_at > ?`);
const selectUserPayments = db.prepare(`SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`);

const updatePaymentStatus = db.prepare(`
  UPDATE payments SET status = ?, tx_hash = ?, confirmed_at = ? WHERE id = ?
`);

const updateExpiredPayments = db.prepare(`
  UPDATE payments SET status = 'expired' WHERE status = 'pending' AND expires_at < ?
`);

// ============================================================================
// CRUD Operations
// ============================================================================

export function createPayment(payment: PaymentRequest): void {
  insertPayment.run({
    $id: payment.id,
    $user_id: payment.userId,
    $chain: payment.chain,
    $amount: payment.amount,
    $amount_usdc: payment.amountUsdc,
    $deposit_address: payment.depositAddress,
    $memo: payment.memo,
    $status: payment.status,
    $created_at: payment.createdAt,
    $expires_at: payment.expiresAt,
  });
}

export function getPaymentByMemo(memo: string): PaymentRequest | null {
  const row = selectPaymentByMemo.get(memo) as any;
  return row ? rowToPayment(row) : null;
}

export function getPaymentById(id: string): PaymentRequest | null {
  const row = selectPaymentById.get(id) as any;
  return row ? rowToPayment(row) : null;
}

export function getPendingPayments(): PaymentRequest[] {
  const now = new Date().toISOString();
  const rows = selectPendingPayments.all(now) as any[];
  return rows.map(rowToPayment);
}

export function getUserPayments(userId: string): PaymentRequest[] {
  const rows = selectUserPayments.all(userId) as any[];
  return rows.map(rowToPayment);
}

export function confirmPayment(paymentId: string, txHash: string): void {
  updatePaymentStatus.run("completed", txHash, new Date().toISOString(), paymentId);
}

export function markPaymentConfirming(paymentId: string, txHash: string): void {
  updatePaymentStatus.run("confirming", txHash, null, paymentId);
}

export function expireOldPayments(): number {
  const now = new Date().toISOString();
  const result = updateExpiredPayments.run(now);
  return result.changes;
}

// ============================================================================
// Helpers
// ============================================================================

function rowToPayment(row: any): PaymentRequest {
  return {
    id: row.id,
    userId: row.user_id,
    chain: row.chain as SupportedChain,
    amount: row.amount,
    amountUsdc: row.amount_usdc,
    depositAddress: row.deposit_address,
    memo: row.memo,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    txHash: row.tx_hash || undefined,
    confirmedAt: row.confirmed_at || undefined,
  };
}

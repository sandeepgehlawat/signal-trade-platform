/**
 * Signal Trade - API Key Management
 *
 * Key format: st_live_xxxx (32 random chars)
 * Keys are hashed before storage for security
 */

import { createHash, randomBytes } from "crypto";
import type { ApiKeyTier, ApiKey } from "../types";
import {
  saveApiKey,
  getApiKeyByHash,
  getApiKeysByUser,
  updateApiKeyUsage,
  revokeApiKey as revokeApiKeyDb,
  getActiveSubscription,
  type ApiKeyRow,
} from "../shared/storage";

// ============================================================================
// RATE LIMITS BY TIER
// ============================================================================

export const RATE_LIMITS = {
  free: {
    connections: 1,
    signalsPerDay: 50,
    delayMs: 5 * 60 * 1000, // 5 minutes
  },
  paid: {
    connections: 5,
    signalsPerDay: Infinity,
    delayMs: 0, // Real-time
  },
} as const;

// Connection tracking
const activeConnections = new Map<string, Set<string>>(); // userId -> Set of connectionIds

// ============================================================================
// KEY GENERATION
// ============================================================================

/**
 * Generate a new API key
 * Format: st_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx (st_live_ + 32 hex chars)
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(16).toString("hex");
  return `st_live_${randomPart}`;
}

/**
 * Hash an API key for secure storage
 * Uses SHA-256 for fast lookups
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Create a new API key for a user
 * @returns Object with key ID and the raw key (only shown once)
 */
export function createApiKey(
  userId: string,
  tier: ApiKeyTier = "free"
): { id: string; key: string; tier: ApiKeyTier } {
  const key = generateApiKey();
  const keyHash = hashApiKey(key);
  const id = `key_${Date.now()}_${randomBytes(4).toString("hex")}`;

  // Calculate expiry (1 year for now)
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  saveApiKey(id, keyHash, userId, tier, expiresAt.toISOString());

  return { id, key, tier };
}

// ============================================================================
// KEY VALIDATION
// ============================================================================

export interface ValidatedKey {
  id: string;
  userId: string;
  tier: ApiKeyTier;
  limits: typeof RATE_LIMITS.free | typeof RATE_LIMITS.paid;
}

/**
 * Validate an API key and return its metadata
 * Updates last_used_at on successful validation
 */
export function validateApiKey(key: string): ValidatedKey | null {
  // Check format
  if (!key.startsWith("st_live_") || key.length !== 40) {
    return null;
  }

  const keyHash = hashApiKey(key);
  const row = getApiKeyByHash(keyHash);

  if (!row) {
    return null;
  }

  // Check if expired
  if (row.expires_at) {
    const expiresAt = new Date(row.expires_at);
    if (expiresAt < new Date()) {
      return null;
    }
  }

  // Update last used timestamp
  updateApiKeyUsage(row.id);

  // Determine tier based on key tier OR active subscription
  let effectiveTier: ApiKeyTier = row.tier as ApiKeyTier;

  // Check for active paid subscription
  const subscription = getActiveSubscription(row.user_id);
  if (subscription && subscription.tier === "paid" && subscription.status === "active") {
    // Check if subscription hasn't expired
    if (!subscription.expires_at || new Date(subscription.expires_at) > new Date()) {
      effectiveTier = "paid";
    }
  }

  return {
    id: row.id,
    userId: row.user_id,
    tier: effectiveTier,
    limits: RATE_LIMITS[effectiveTier],
  };
}

/**
 * Revoke an API key (soft delete)
 */
export function revokeApiKey(keyId: string): void {
  revokeApiKeyDb(keyId);
}

/**
 * List all API keys for a user
 */
export function listUserKeys(userId: string): ApiKey[] {
  const rows = getApiKeysByUser(userId);
  return rows.map(rowToApiKey);
}

function rowToApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    user_id: row.user_id,
    tier: row.tier as ApiKeyTier,
    created_at: row.created_at,
    expires_at: row.expires_at || undefined,
    last_used_at: row.last_used_at || undefined,
    is_active: row.is_active === 1,
  };
}

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * Track a new connection for a user
 * @returns true if connection allowed, false if at limit
 */
export function trackConnection(userId: string, connectionId: string, tier: ApiKeyTier): boolean {
  const limits = RATE_LIMITS[tier];

  if (!activeConnections.has(userId)) {
    activeConnections.set(userId, new Set());
  }

  const userConnections = activeConnections.get(userId)!;

  if (userConnections.size >= limits.connections) {
    return false;
  }

  userConnections.add(connectionId);
  return true;
}

/**
 * Remove a connection from tracking
 */
export function removeConnection(userId: string, connectionId: string): void {
  const userConnections = activeConnections.get(userId);
  if (userConnections) {
    userConnections.delete(connectionId);
    if (userConnections.size === 0) {
      activeConnections.delete(userId);
    }
  }
}

/**
 * Get current connection count for a user
 */
export function getConnectionCount(userId: string): number {
  return activeConnections.get(userId)?.size || 0;
}

// ============================================================================
// ADMIN UTILITIES
// ============================================================================

/**
 * Create an admin/internal API key with paid tier
 * Used for testing and internal services
 */
export function createAdminKey(userId: string = "admin"): { id: string; key: string } {
  const result = createApiKey(userId, "paid");
  return { id: result.id, key: result.key };
}

/**
 * Mask a key for display (show only first 8 and last 4 chars)
 */
export function maskKey(key: string): string {
  if (key.length < 16) return "****";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

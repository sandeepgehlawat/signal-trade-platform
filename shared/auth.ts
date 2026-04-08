/**
 * Signal Trade - Authentication Module
 *
 * Google OAuth authentication
 */

import { createHash, randomBytes } from "crypto";
import {
  createUser,
  getUserByEmail,
  getUserById,
  updateLastLogin,
  createSession,
  getSessionByTokenHash,
  deleteSessionById,
  deleteAllUserSessions,
  cleanExpiredSessions,
  migrateApiKeysToUser,
  migrateSubscriptionsToUser,
  type UserRow,
} from "./storage";

// ============================================================================
// CONFIGURATION
// ============================================================================

const SESSION_EXPIRY_DAYS = 30;
const BASE_URL = process.env.BASE_URL || "http://localhost:3460";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = `${BASE_URL}/auth/google/callback`;

// ============================================================================
// HELPERS
// ============================================================================

function generateId(): string {
  return randomBytes(16).toString("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// ============================================================================
// GOOGLE OAUTH
// ============================================================================

/**
 * Get Google OAuth URL for login
 */
export function getGoogleAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state: state || generateToken(),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Exchange authorization code for tokens and user info
 */
export async function handleGoogleCallback(code: string): Promise<{
  success: boolean;
  sessionToken?: string;
  user?: UserRow;
  error?: string;
}> {
  try {
    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error("[auth] Google token error:", error);
      return { success: false, error: "Failed to authenticate with Google" };
    }

    const tokens = await tokenResponse.json();

    // Get user info
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userResponse.ok) {
      return { success: false, error: "Failed to get user info from Google" };
    }

    const googleUser = await userResponse.json();
    const email = googleUser.email;

    if (!email) {
      return { success: false, error: "No email from Google" };
    }

    // Get or create user
    let user = getUserByEmail(email);
    if (!user) {
      const userId = `user_${generateId()}`;
      createUser(userId, email);
      user = getUserByEmail(email);
    }

    if (!user) {
      return { success: false, error: "Failed to create user" };
    }

    // Update last login
    updateLastLogin(user.id);

    // Create session
    const sessionId = generateId();
    const sessionToken = generateToken();
    const sessionTokenHash = hashToken(sessionToken);
    const expiresAt = addDays(new Date(), SESSION_EXPIRY_DAYS);

    createSession(sessionId, user.id, sessionTokenHash, expiresAt.toISOString());

    return { success: true, sessionToken, user };
  } catch (e) {
    console.error("[auth] Google callback error:", e);
    return { success: false, error: String(e) };
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export interface SessionUser {
  userId: string;
  email: string;
  sessionId: string;
}

/**
 * Validate a session token and return the user
 */
export function validateSession(sessionToken: string): SessionUser | null {
  const tokenHash = hashToken(sessionToken);
  const session = getSessionByTokenHash(tokenHash);

  if (!session) {
    return null;
  }

  const user = getUserById(session.user_id);
  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    sessionId: session.id,
  };
}

/**
 * Logout - delete session
 */
export function logout(sessionToken: string): void {
  const tokenHash = hashToken(sessionToken);
  const session = getSessionByTokenHash(tokenHash);
  if (session) {
    deleteSessionById(session.id);
  }
}

/**
 * Logout all sessions for a user
 */
export function logoutAll(userId: string): void {
  deleteAllUserSessions(userId);
}

// ============================================================================
// USER DATA MIGRATION
// ============================================================================

/**
 * When a user logs in, migrate any data from their browser-generated ID
 * to their authenticated user ID
 */
export function migrateUserData(oldUserId: string, newUserId: string): void {
  migrateApiKeysToUser(oldUserId, newUserId);
  migrateSubscriptionsToUser(oldUserId, newUserId);
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up expired sessions
 * Call periodically (e.g., every hour)
 */
export function cleanupExpired(): void {
  cleanExpiredSessions();
}

// Run cleanup every hour
setInterval(cleanupExpired, 60 * 60 * 1000);

// ============================================================================
// CONFIG CHECK
// ============================================================================

export function isGoogleAuthConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

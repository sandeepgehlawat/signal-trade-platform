/**
 * Signal Trade - Input Validation
 *
 * Zod schemas for validating API inputs
 */

import { z } from "zod";

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

export const urlSchema = z.string().url().max(2000);

export const userIdSchema = z.string()
  .min(1, "User ID is required")
  .max(100, "User ID too long")
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid user ID format");

// ============================================================================
// API ENDPOINT SCHEMAS
// ============================================================================

/**
 * POST /process - Process URL or text input
 */
export const processInputSchema = z.object({
  input: z.string()
    .min(1, "Input is required")
    .max(10000, "Input too long (max 10,000 characters)"),
  auto_save: z.boolean().optional().default(true),
  paper_mode: z.boolean().optional(),
});

export type ProcessInput = z.infer<typeof processInputSchema>;

/**
 * POST /keys - Create API key
 */
export const createKeySchema = z.object({
  user_id: userIdSchema,
  tier: z.enum(["free", "paid"]).optional().default("free"),
});

export type CreateKeyInput = z.infer<typeof createKeySchema>;

/**
 * POST /subscribe - Create subscription
 */
export const createSubscriptionSchema = z.object({
  user_id: userIdSchema,
  tier: z.enum(["free", "paid"]),
  billing_period: z.enum(["weekly", "monthly"]).optional().default("weekly"),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

/**
 * POST /trades/:id/close - Close a trade
 */
export const closeTradeSchema = z.object({
  current_price: z.number().positive().optional(),
  close_reason: z.string().max(500).optional(),
});

export type CloseTradeInput = z.infer<typeof closeTradeSchema>;

// ============================================================================
// VALIDATION HELPER
// ============================================================================

/**
 * Validate input against a Zod schema
 * Returns { success: true, data } or { success: false, error }
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Format error message
  const errors = result.error.errors.map((e) => {
    const path = e.path.length > 0 ? `${e.path.join(".")}: ` : "";
    return `${path}${e.message}`;
  });

  return { success: false, error: errors.join("; ") };
}

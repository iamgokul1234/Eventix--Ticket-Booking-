import crypto from 'crypto';

/**
 * Hash a request fingerprint for idempotency matching.
 * Uses SHA-256 over the serialized payload.
 */
export function hashPayload(payload: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

/**
 * Generate a unique booking reference: TKT-{timestamp}-{random6hex}
 */
export function generateBookingReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TKT-${timestamp}-${random}`;
}

/**
 * Sleep for a given number of milliseconds. Used in tests only.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

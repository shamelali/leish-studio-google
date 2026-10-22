/**
 * Runtime store helpers shared by the persistence adapters.
 *
 * Keeping these values outside data-store.ts prevents the adapter modules from
 * creating a runtime import cycle while data-store.ts selects the active store.
 */
export class SlotConflictError extends Error {
  constructor() {
    super('Slot conflict');
    this.name = 'SlotConflictError';
  }
}

/** Idempotency records live 24h (G3) and are scoped per owner (BR-3). */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export function idempotencyExpiry(now = Date.now()): string {
  return new Date(now + IDEMPOTENCY_TTL_MS).toISOString();
}

export function isIdempotencyLive(expiresAt: string, now = Date.now()): boolean {
  return new Date(expiresAt).getTime() > now;
}

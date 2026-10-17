/**
 * Guest contact verification (FR-001, D1b/G1): a 6-digit OTP emailed via
 * Brevo, required before an anonymous booking can be created. Codes are
 * hashed at rest, expire after 10 minutes, allow 5 attempts, and are
 * single-use — consumed by the booking create that presents them.
 *
 * Persistence lives in the active DataStore (per-store placement, same as
 * idempotency keys) so codes survive serverless instance boundaries.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

export const VERIFICATION_TTL_MS = 10 * 60 * 1000;
export const MAX_VERIFICATION_ATTEMPTS = 5;
/** Minimum gap between code issues for the same contact (issue throttle). */
export const ISSUE_THROTTLE_MS = 60 * 1000;

export interface ContactVerificationRecord {
  /** Normalized (lowercased) contact — the record key. */
  contact: string;
  /** sha256(`${contact}:${code}`) — the code itself is never stored. */
  codeHash: string;
  expiresAt: string;
  attempts: number;
}

export type VerificationOutcome = 'ok' | 'invalid' | 'expired' | 'locked';

export function isVerificationEnabled(): boolean {
  // Explicit opt-out for isolated test runs only; production default is ON.
  return process.env.LEISH_REQUIRE_CONTACT_VERIFICATION !== '0';
}

export function normalizeContact(contact: string): string {
  return contact.trim().toLowerCase();
}

export function contactKey(contact: string): string {
  return createHash('sha256').update(normalizeContact(contact)).digest('hex');
}

export function hashCode(contact: string, code: string): string {
  // Binding the hash to the contact means a captured hash cannot be replayed
  // against a different address.
  return createHash('sha256').update(`${normalizeContact(contact)}:${code}`).digest('hex');
}

/** Cryptographically random 6-digit numeric code (leading zeros allowed). */
export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export interface IssuedVerification {
  record: ContactVerificationRecord;
  /** Plaintext code — handed to the email transport only. */
  code: string;
}

export function newVerificationRecord(contact: string, now = Date.now()): IssuedVerification {
  const normalized = normalizeContact(contact);
  const code = generateCode();
  return {
    code,
    record: {
      contact: normalized,
      codeHash: hashCode(normalized, code),
      expiresAt: new Date(now + VERIFICATION_TTL_MS).toISOString(),
      attempts: 0,
    },
  };
}

/** True when a record was issued too recently to allow a resend. */
export function isIssueThrottled(record: ContactVerificationRecord, now = Date.now()): boolean {
  const issuedAt = new Date(record.expiresAt).getTime() - VERIFICATION_TTL_MS;
  return now - issuedAt < ISSUE_THROTTLE_MS;
}

/** Constant-time comparison of the submitted code against the stored hash. */
export function codeMatches(record: ContactVerificationRecord, contact: string, code: string): boolean {
  const expected = Buffer.from(record.codeHash, 'hex');
  const actual = Buffer.from(hashCode(contact, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isRecordExpired(record: ContactVerificationRecord, now = Date.now()): boolean {
  return new Date(record.expiresAt).getTime() <= now;
}

/**
 * Classify a verification attempt against a record. Callers own the
 * persistence effects (see DataStore.verifyAndConsumeContact): success
 * consumes the record; the final allowed failure invalidates it (AC-015).
 */
export function classifyAttempt(
  record: ContactVerificationRecord | undefined,
  contact: string,
  code: string,
  now = Date.now(),
): { outcome: VerificationOutcome; nextAttempts?: number; consume?: boolean } {
  if (!record) return { outcome: 'invalid' };
  if (record.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    return { outcome: 'locked', consume: true };
  }
  if (isRecordExpired(record, now)) {
    return { outcome: 'expired', consume: true };
  }
  if (codeMatches(record, contact, code)) {
    return { outcome: 'ok', consume: true };
  }
  const nextAttempts = record.attempts + 1;
  return { outcome: 'invalid', nextAttempts, consume: nextAttempts >= MAX_VERIFICATION_ATTEMPTS };
}

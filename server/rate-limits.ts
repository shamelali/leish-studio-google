/**
 * Rate-limit buckets (TR-8) — per-domain budgets so an AI burst cannot
 * starve login or booking writes. Mounted path-scoped in server/app.ts,
 * exactly mirroring the original monolith's limiter configuration:
 *   auth     20 / 15 min        ai       15 / min
 *   reads    120 / min          writes   20 / min (POST /api/bookings only)
 *   verify   10 / 10 min        healthz  exempt
 * LEISH_DISABLE_RATE_LIMIT=1 skips every bucket; the test suite sets it so
 * the authz matrix can log in repeatedly (server.ratelimit.test.ts covers
 * the bucket behaviour itself with the flag unset).
 */
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

const RATE_LIMIT_OFF = process.env.LEISH_DISABLE_RATE_LIMIT === '1';

/** Auth endpoints: brute-force budget for register/login/OAuth exchanges. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs for auth routes
  skip: () => RATE_LIMIT_OFF,
  message: { error: 'Too many attempts, please try again later.' },
});

/** Gemini advisory/creative endpoints — smallest public budget. */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  skip: () => RATE_LIMIT_OFF,
  message: { error: 'AI requests are rate-limited right now. Please try again shortly.' },
});

/**
 * General read traffic. Skips the paths that own their dedicated bucket
 * (auth, AI, verification, booking creates) and the liveness probe, which
 * must stay reachable under any load for uptime checks.
 */
export const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  skip: (req: Request) =>
    RATE_LIMIT_OFF ||
    req.path.startsWith('/auth') ||
    req.path.startsWith('/gemini') ||
    req.path.startsWith('/healthz') ||
    (req.method === 'POST' && (req.path === '/bookings' || req.path === '/bookings/verify-request')),
  message: { error: 'Too many requests, please try again later.' },
});

/**
 * Booking creates get their own bucket (FR-008/AC-012) so a write burst
 * cannot consume the shared read budget. Mounted at /api/bookings: only
 * POST to the collection itself ('/') counts — reads and status patches
 * stay in their own buckets.
 */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  skip: (req: Request) => RATE_LIMIT_OFF || !(req.method === 'POST' && req.path === '/'),
  message: { error: 'Too many booking attempts, please try again shortly.' },
});

/**
 * Verification codes cost money (Brevo) and can be abused for mail-bombing,
 * so issuing them is throttled hardest (per-IP; the per-contact throttle
 * lives in the handler via isIssueThrottled).
 */
export const verifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  skip: () => RATE_LIMIT_OFF,
  message: { error: 'Too many verification requests, please try again later.' },
});

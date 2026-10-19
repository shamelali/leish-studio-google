/**
 * Composition root for the Leish API.
 *
 * The former 2,500-line monolith now lives in focused modules:
 *   - server/app.ts            → createApp() factory + cross-cutting middleware
 *   - server/routes/*.ts       → auth, salons, bookings, reviews, AI, venue
 *   - server/authz.ts          → authorization predicates
 *   - server/rate-limits.ts    → per-bucket express-rate-limit instances
 *   - server/jwt-secret.ts     → TR-9 production secret guard
 *
 * Vercel and the test suites import this file directly, so every symbol they
 * relied on is re-exported here unchanged. When run directly (local dev via
 * `tsx dev.ts`) we build the default app; on Vercel the platform invokes the
 * default export (the Express app) for every non-asset request.
 */
import { createApp } from './server/app.ts';

export { createApp };
export type { AppDependencies } from './server/app.ts';
export type { AIResponseSource } from './server/routes/ai-advisors.ts';
export {
  stripJsonFences,
  buildSalonsContext,
  getCachedSalonsContext,
} from './server/routes/ai-advisors.ts';
export { getJwtSecret } from './server/jwt-secret.ts';

const app = createApp();

export default app;

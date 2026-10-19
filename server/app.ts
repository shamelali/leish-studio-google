/**
 * The Express application factory, extracted from the server.ts monolith.
 *
 * server.ts remains the thin composition root (Vercel and the test suites
 * import it directly); this module owns cross-cutting middleware wiring and
 * registers the focused route modules under server/routes/ so new endpoints
 * land in small files instead of one 2,500-line entry point.
 */
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { GoogleGenAI } from '@google/genai';
import type { NextFunction, Request, Response } from 'express';
import type { Booking } from '../src/types.ts';
import { store as defaultStore, type DataStore } from './data-store.ts';
import { logger } from './monitoring.ts';
import { getJwtSecret } from './jwt-secret.ts';
import { canModifyBooking, canUpdateSalon } from './authz.ts';
import { authLimiter, aiLimiter, readLimiter, verifyLimiter, writeLimiter } from './rate-limits.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerSalonRoutes } from './routes/salons.ts';
import { registerBookingRoutes } from './routes/bookings.ts';
import { registerReviewRoutes } from './routes/reviews.ts';
import { registerAiRoutes } from './routes/ai-advisors.ts';
import { registerAiStudioRoutes } from './routes/ai-studio.ts';
import { registerVenueRoutes } from './routes/venue.ts';
import { registerConciergeRoute } from './concierge.ts';

export interface AppDependencies {
  store?: DataStore;
  ai?: GoogleGenAI;
  aiTimeoutMs?: number;
}

const AI_TIMEOUT_MS = 7000;

export function createApp(dependencies: AppDependencies = {}) {
  const appStore = dependencies.store ?? defaultStore;
  const aiClient = dependencies.ai ?? new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  const aiTimeoutMs = Math.max(1, dependencies.aiTimeoutMs ?? AI_TIMEOUT_MS);
  const app = express();

  // Vercel rewrite compatibility. /api/* rewrites to the /api/[...path]
  // function with the original sub-path carried in the `...path` query
  // param. Depending on platform behavior the function may receive the
  // pre- or post-rewrite URL, so normalize back to the real API path here:
  // when the param is absent (local dev, tests) this is a no-op, and when
  // present it reproduces exactly the URL the client requested.
  app.use((req, _res, next) => {
    const routed = (req.query as Record<string, unknown>)?.['...path'];
    if (typeof routed === 'string' && routed) {
      const rest = Object.entries((req.query ?? {}) as Record<string, unknown>)
        .filter(([key]) => key !== '...path')
        .map(([key, value]) => {
          const first = Array.isArray(value) ? value[0] : value;
          return `${encodeURIComponent(key)}=${encodeURIComponent(String(first ?? ''))}`;
        })
        .join('&');
      req.url = `/api/${routed.replace(/^\/+/, '')}${rest ? `?${rest}` : ''}`;
    }
    next();
  });

  // Behind the Vercel proxy, trust the first X-Forwarded-For hop so
  // req.ip (and express-rate-limit) see the real client address.
  if (process.env.VERCEL) {
    app.set('trust proxy', 1);
  }

  // Security headers. CSP is enforced in production only — dev needs Vite's
  // HMR/inline client. Directives allow Google Fonts, Google Maps (loaded by
  // @vis.gl/react-google-maps), Firebase/Google sign-in popups and CDN imagery.
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        scriptSrc: ["'self'", 'https://maps.googleapis.com', 'https://maps.gstatic.com', 'https://www.gstatic.com'],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://*.googleapis.com', 'https://*.googleusercontent.com', 'https://*.gstatic.com', 'https://*.google.com'],
        frameSrc: ["'self'", 'https://accounts.google.com', 'https://*.googleapis.com'],
        workerSrc: ["'self'", 'blob:'],
        upgradeInsecureRequests: [],
      },
    } : false,
  }));

  // Rate limiting — separate buckets so an AI burst cannot starve login (TR-8).
  // Mounted path-scoped, before the body parser, exactly mirroring the order
  // the monolith used. See server/rate-limits.ts for the budgets and
  // server.ratelimit.test.ts for the bucket behaviour itself.
  app.use('/api/bookings/verify-request', verifyLimiter);
  app.use('/api/bookings', writeLimiter);
  app.use('/api/auth/', authLimiter);
  app.use('/api/gemini/', aiLimiter);
  app.use('/api/', readLimiter);

  // JSON body size limit
  app.use(express.json({ limit: '100kb' }));

  // Request ID middleware (for tracing)
  app.use((req, _res, next) => {
    const getHeader = (name: string): string | undefined => {
      const val = req.headers[name];
      return Array.isArray(val) ? val[0] : val;
    };
    req.requestId = getHeader('x-request-id') ||
      getHeader('x-vercel-id') ||
      `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    next();
  });

  // Structured request logging: one JSON line per request with latency and
  // status, correlated by requestId (wires server/monitoring.ts into the app).
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      logger.info('request', {
        requestId: req.requestId,
        method: req.method,
        route: req.originalUrl?.split('?')[0],
        statusCode: res.statusCode,
        latencyMs: Number(process.hrtime.bigint() - start) / 1_000_000,
      });
    });
    next();
  });

  // Lightweight liveness probe: no store access, safe for high-frequency
  // uptime checks (exempt from the read limiter above).
  app.get('/api/healthz', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  registerConciergeRoute(app, { getSalons: () => appStore.getSalons() });

  // JWT configuration — TR-9: production must never boot on a default secret.
  const JWT_SECRET = getJwtSecret();
  const JWT_EXPIRES_IN = '7d';

  // Auth middleware
  const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const token = authHeader.replace('Bearer ', '').trim();
    let decoded: { userId?: unknown };
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { userId?: unknown };
      if (typeof decoded.userId !== 'string' || !decoded.userId) {
        res.status(401).json({ error: 'Invalid or expired token.' });
        return;
      }
    } catch {
      res.status(401).json({ error: 'Invalid or expired token.' });
      return;
    }
    try {
      const user = await appStore.getUserById(decoded.userId as string);
      if (!user) {
        res.status(401).json({ error: 'User not found.' });
        return;
      }
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };

  /** Requires authenticateToken first. 403 unless the caller is an admin. */
  const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ error: 'Administrator access required.' });
      return;
    }
    next();
  };

  /** Requires authenticateToken first. 403 unless the caller manages :id. */
  const requireSalonOwner = (req: Request, res: Response, next: NextFunction): void => {
    if (!canUpdateSalon(req.user, req.params.id)) {
      res.status(403).json({ error: 'You do not have permission to manage this salon.' });
      return;
    }
    next();
  };

  /** Requires authenticateToken first. Loads the booking onto req.booking and
   *  403s unless the caller may modify it (provider owns salon / client owns booking). */
  const requireBookingAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let booking: Booking | undefined;
    try {
      booking = await appStore.getBooking(req.params.id);
    } catch (error) {
      next(error);
      return;
    }
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (!canModifyBooking(req.user, booking)) {
      res.status(403).json({ error: 'You do not have permission to change this booking.' });
      return;
    }
    req.booking = booking;
    next();
  };

  const ctx: import('./routes/context.ts').RouteContext & { jwtExpiresIn: string } = {
    store: appStore,
    jwtSecret: JWT_SECRET,
    jwtExpiresIn: JWT_EXPIRES_IN,
    authenticateToken,
    requireAdmin,
    requireSalonOwner,
    requireBookingAccess,
  };
  const aiCtx = { ...ctx, aiClient, aiTimeoutMs };

  // ── Route registration (order mirrors the original monolith) ───────────
  registerAuthRoutes(app, ctx);
  registerSalonRoutes(app, ctx);
  registerBookingRoutes(app, ctx);
  registerReviewRoutes(app, ctx);
  registerAiRoutes(app, aiCtx);
  registerVenueRoutes(app, ctx);
  registerAiStudioRoutes(app, aiCtx);

  // Express 4 does not automatically turn rejected async middleware into an
  // HTTP response. Keep this last so storage/authorization failures delegated
  // with next(error) cannot become unhandled rejections or hung requests.
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API] Unhandled request failure');
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

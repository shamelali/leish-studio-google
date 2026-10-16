import express from 'express';
import { store, type DataStore } from './server/data-store.ts';
import { GoogleGenAI, Type, GenerateVideosOperation } from '@google/genai';
import type { Booking, Review, Service, Salon, User } from './src/types.ts';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { registerConciergeRoute } from './server/concierge.ts';
import { bookingSchema, adminUserUpdateSchema, salonCreateSchema, salonUpdateSchema, serviceUpdateSchema, serviceCreateSchema } from './server/validation.ts';
import { calcDistanceKm } from './server/geo.ts';
import { sendBookingConfirmation } from './server/email.ts';
import {
  isSupabaseAuthConfigured,
  verifySupabasePassword,
  verifySupabaseToken,
  createSupabaseUser,
  deleteSupabaseUser,
} from './server/supabase-auth.ts';
import { logger, withLogging, recordMetric, Metrics } from './server/monitoring.ts';

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export type AIResponseSource = 'model' | 'fallback';

const adviceRequestSchema = z.object({
  goals: z.string().trim().min(1).max(1000),
  skinHairType: z.string().trim().min(1).max(1000),
  occasion: z.string().trim().min(1).max(200),
  preferredCategory: z.string().trim().max(100).optional(),
}).strict();

const adviceResponseSchema = z.object({
  recommendationText: z.string().trim().min(1).max(2500),
  suggestedServices: z.array(z.object({
    serviceName: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(100),
    salonName: z.string().trim().min(1).max(200),
    salonId: z.string().trim().min(1).max(120),
    estimatedPrice: z.number().finite().nonnegative().max(100000),
    reason: z.string().trim().min(1).max(800),
  }).strict()).max(3),
}).strict();

const reviewSummaryRequestSchema = z.object({
  salonId: z.string().trim().min(1).max(120),
}).strict();

const reviewSummaryResponseSchema = z.object({
  vibe: z.string().trim().min(1).max(500),
  bestFor: z.string().trim().min(1).max(500),
  tip: z.string().trim().min(1).max(500),
}).strict();

const AI_TIMEOUT_MS = 7000;
const clip = (value: string, max: number): string => value.slice(0, max);

// --- AI Prompt Context Builder (extracted for testability and caching) ---
const MAX_SALON_NAME = 200;
const MAX_SALON_ID = 120;
const MAX_CATEGORY = 100;
const MAX_LOCATION = 200;
const MAX_TAGLINE = 300;
const MAX_SERVICE_NAME = 200;
const MAX_SERVICE_DESC = 500;
const MAX_SERVICES_PER_SALON = 20;
const MAX_CONTEXT_CHARS = 18000;

export function buildSalonsContext(salons: readonly (Salon & { services: Service[] })[]): string {
  return clip(salons.map(s => {
    const services = s.services.slice(0, MAX_SERVICES_PER_SALON).map(sv =>
      `${clip(sv.name, MAX_SERVICE_NAME)} (${sv.price}, ${sv.duration} mins - ${clip(sv.description, MAX_SERVICE_DESC)})`,
    ).join('; ');
    return `- Makeup Studio: ${clip(s.name, MAX_SALON_NAME)} (ID: ${clip(s.id, MAX_SALON_ID)}, specialty: ${clip(s.category, MAX_CATEGORY)}, location: ${clip(s.location, MAX_LOCATION)})
  Tagline: ${clip(s.tagline, MAX_TAGLINE)}
  Services: ${services}`;
  }).join('\n\n'), MAX_CONTEXT_CHARS);
}

// Cached version that rebuilds only when salon data changes
let salonsContextCache: { context: string; version: number } | null = null;

export async function getCachedSalonsContext(getSalons: () => Promise<Salon[]> | Salon[]): Promise<string> {
  const salons = getSalons();
  const salonsArray = Array.isArray(salons) ? salons : await salons;
  
  // Generate a simple version hash from salon IDs and service counts
  const version = salonsArray.reduce((acc, s) => {
    acc ^= s.id.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
    acc ^= s.services.length;
    return acc;
  }, 0);

  if (salonsContextCache && salonsContextCache.version === version) {
    return salonsContextCache.context;
  }

  const context = buildSalonsContext(salonsArray);
  salonsContextCache = { context, version };
  return context;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseModelJson<T extends z.ZodType>(text: unknown, schema: T): z.output<T> | undefined {
  if (typeof text !== 'string' || !text.trim()) return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(stripJsonFences(text)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

const configuredGeminiKey = (): boolean => {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && !/^MY_|^YOUR_/i.test(key));
};

type AdviceRequest = z.infer<typeof adviceRequestSchema>;
type AdviceData = z.infer<typeof adviceResponseSchema>;
type ReviewSummaryData = z.infer<typeof reviewSummaryResponseSchema>;

function fallbackAdvice(input: AdviceRequest, salons: Awaited<ReturnType<DataStore['getSalons']>>): AdviceData & { source: 'fallback' } {
  const candidates = salons
    .flatMap(salon => salon.services.map(service => ({ salon, service })))
    .sort((a, b) => a.salon.id.localeCompare(b.salon.id) || a.service.id.localeCompare(b.service.id));
  const preferred = input.preferredCategory?.toLowerCase();
  const preferredCandidates = preferred
    ? candidates.filter(({ salon, service }) => salon.category.toLowerCase() === preferred || service.category.toLowerCase() === preferred)
    : candidates;
  const selected = (preferredCandidates.length > 0 ? preferredCandidates : candidates).slice(0, 3);

  return {
    source: 'fallback',
    recommendationText: clip(
      `Based on your goal of "${input.goals}" and your skin profile "${input.skinHairType}", our makeup ateliers recommend custom complexion sculpting and long-wear artistry.`,
      2500,
    ),
    suggestedServices: selected.map(({ salon, service }) => ({
      serviceName: clip(service.name, 200),
      category: clip(service.category, 100),
      salonName: clip(salon.name, 200),
      salonId: clip(salon.id, 120),
      estimatedPrice: (() => {
        const price = Number(service.price);
        return Number.isFinite(price) ? Math.min(100000, Math.max(0, price)) : 0;
      })(),
      reason: clip(`A ${service.category} service selected from the live Leish catalogue for your ${input.occasion} plans.`, 800),
    })),
  };
}

function fallbackReviewSummary(hasReviews: boolean): ReviewSummaryData & { source: 'fallback' } {
  return hasReviews
    ? {
        source: 'fallback',
        vibe: 'Sophisticated and deeply professional. Guests appreciate the exquisite premium aesthetic.',
        bestFor: 'Precision treatments and highly detailed beauty consulting by creative lead stylists.',
        tip: 'Secure weekend bookings well in advance, as premium afternoon slots fill up quickly.',
      }
    : {
        source: 'fallback',
        vibe: 'Inviting and fresh. Ready to welcome its first clients with personalized premium care.',
        bestFor: 'First-time visitors seeking dedicated, highly customized care in an exclusive environment.',
        tip: 'Book early to secure slots with their main professionals as they establish their premier schedule.',
      };
}

export interface AppDependencies {
  store?: DataStore;
  ai?: GoogleGenAI;
  aiTimeoutMs?: number;
}

/**
 * Strips markdown code fences (```json or ```) that models sometimes wrap
 * around JSON payloads. Exported so the regression suite can pin the behaviour.
 */
export function stripJsonFences(text: string): string {
  let cleanText = text.trim();
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleanText;
}

/**
 * Resolve the JWT signing secret from the environment.
 *
 * The optional arguments make the production boot contract independently
 * testable without re-importing the Express singleton. Development/test keeps
 * the historical fallback so local setup remains frictionless; production
 * never accepts an empty value or a documented placeholder.
 */
export function getJwtSecret(
  environment = process.env.NODE_ENV,
  configuredSecret = process.env.JWT_SECRET,
): string {
  const secret = configuredSecret?.trim();
  const isPlaceholder = !secret || [
    'leish-dev-secret-change-in-production',
    'MY_JWT_SECRET',
    'YOUR_JWT_SECRET_HERE',
  ].includes(secret) || /^(MY_|YOUR_|GENERATE_)/i.test(secret);
  const isWeak = Boolean(secret && secret.length < 32);

  if (environment === 'production' && (isPlaceholder || isWeak)) {
    throw new Error(
      '[leish] JWT_SECRET is not set (or is a placeholder). Refusing to boot in production with an unsafe signing secret (TR-9).'
    );
  }

  if (isWeak) {
    console.warn('[leish] JWT_SECRET is weak (<32 chars). Use a strong secret even in development.');
  }
  if (isPlaceholder && environment !== 'production') {
    console.warn('[leish] JWT_SECRET is a placeholder. Set a strong secret in production.');
  }

  return secret || 'leish-dev-secret-change-in-production';
}

export function createApp(dependencies: AppDependencies = {}) {
  const appStore = dependencies.store ?? store;
  const aiClient = dependencies.ai ?? ai;
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
  // LEISH_DISABLE_RATE_LIMIT=1 skips all buckets; the test suite sets it so the
  // authz matrix can log in repeatedly. See server.ratelimit.test.ts for the
  // bucket behaviour itself.
  const rateLimitOff = process.env.LEISH_DISABLE_RATE_LIMIT === '1';
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // limit each IP to 20 requests per windowMs for auth routes
    skip: () => rateLimitOff,
    message: { error: 'Too many attempts, please try again later.' }
  });
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    skip: () => rateLimitOff,
    message: { error: 'AI requests are rate-limited right now. Please try again shortly.' }
  });
  const readLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    skip: (req) => rateLimitOff || req.path.startsWith('/auth') || req.path.startsWith('/gemini'),
    message: { error: 'Too many requests, please try again later.' }
  });
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

  registerConciergeRoute(app, { getSalons: () => appStore.getSalons() });

  // Helper to strip sensitive data
  const sanitizeUser = (u: any): User => {
    const { password, ...safeUser } = u;
    return safeUser as User;
  };

  // Never send (or log) backend exception messages: SDK errors can contain
  // credential paths and connection details. Express 4 does not forward
  // rejected async middleware promises automatically.
  const serverError = (res: express.Response, message: string) => {
    console.error('[API] Request failed');
    return res.status(500).json({ error: message });
  };

  // JWT configuration — TR-9: production must never boot on a default secret.
  const JWT_SECRET = getJwtSecret();
  const JWT_EXPIRES_IN = '7d';

  // Auth middleware
  const authenticateToken = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    let decoded: { userId?: unknown };
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { userId?: unknown };
      if (typeof decoded.userId !== 'string' || !decoded.userId) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
      }
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    try {
      const user = await appStore.getUserById(decoded.userId as string);
      if (!user) {
        return res.status(401).json({ error: 'User not found.' });
      }
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };

  // --- AUTHORIZATION (TR-7) — enforced in middleware, not per-handler ---
  const canUpdateSalon = (user: User, salonId: string): boolean =>
    user.role === 'admin' || (user.role === 'provider' && user.salonId === salonId);

  const canModifyBooking = (user: User, booking: Booking): boolean =>
    canUpdateSalon(user, booking.salonId) ||
    (booking.clientId !== undefined && booking.clientId === user.id) ||
    // Fallback for legacy bookings without clientId: compare emails (case-insensitive)
    (booking.clientId === undefined && booking.clientEmail.toLowerCase() === user.email.toLowerCase());

  const findReviewEligibility = async (
    user: User,
    salonId: string,
    requestedBookingId?: string,
  ): Promise<{ booking?: Booking; duplicate: boolean }> => {
    const [bookings, reviews] = await Promise.all([
      appStore.getBookings(),
      appStore.getSalonReviews(salonId),
    ]);
    const completedBookings = bookings.filter(booking =>
      booking.salonId === salonId &&
      ((booking.clientId !== undefined && booking.clientId === user.id) ||
        (booking.clientId === undefined && booking.clientEmail.toLowerCase() === user.email.toLowerCase())) &&
      booking.status === 'completed',
    );

    if (requestedBookingId) {
      const booking = completedBookings.find(candidate => candidate.id === requestedBookingId);
      return {
        booking,
        duplicate: Boolean(booking && reviews.some(review =>
          review.reviewerId === user.id && review.bookingId === booking.id,
        )),
      };
    }

    const reviewedBookingIds = new Set(
      reviews
        .filter(review => review.reviewerId === user.id && review.bookingId)
        .map(review => review.bookingId as string),
    );
    const booking = completedBookings.find(candidate => !reviewedBookingIds.has(candidate.id));
    return {
      booking,
      duplicate: !booking && completedBookings.length > 0,
    };
  };

  /** Requires authenticateToken first. 403 unless the caller is an admin. */
  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Administrator access required.' });
    }
    next();
  };

  /** Requires authenticateToken first. 403 unless the caller manages :id. */
  const requireSalonOwner = (req: any, res: any, next: any) => {
    if (!canUpdateSalon(req.user, req.params.id)) {
      return res.status(403).json({ error: 'You do not have permission to manage this salon.' });
    }
    next();
  };

  /** Requires authenticateToken first. Loads the booking onto req.booking and
   *  403s unless the caller may modify it (provider owns salon / client owns booking). */
  const requireBookingAccess = async (req: any, res: any, next: any) => {
    let booking: Booking | undefined;
    try {
      booking = await appStore.getBooking(req.params.id);
    } catch (error) {
      return next(error);
    }
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (!canModifyBooking(req.user, booking)) {
      return res.status(403).json({ error: 'You do not have permission to change this booking.' });
    }
    req.booking = booking;
    next();
  };

  // Validation schemas
  const registerSchema = z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    password: z.string().min(6).max(100),
    role: z.enum(['client', 'provider']).optional(),
    phone: z.string().optional(),
    bio: z.string().max(500).optional(),
  });

  // Login accepts an email address or a short demo username (e.g. the
  // `client` / `studio` demo accounts). Registration still requires a
  // real email address; see registerSchema below.
  const loginSchema = z.object({
    email: z.string().trim().min(1, 'Enter your email or demo username.').max(254),
    password: z.string().min(1),
  });

  const reviewSchema = z.object({
    salonId: z.string().min(1),
    // Kept optional for compatibility with clients that already send it; the
    // server always uses the authenticated account name instead.
    clientName: z.string().trim().min(1).max(100).optional(),
    bookingId: z.string().trim().min(1).max(120).optional(),
    rating: z.number().int().min(1).max(5),
    text: z.string().min(1).max(2000),
  });

  const updateBookingStatusSchema = z.object({
    status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']),
  });

  const updateProfileSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(100).optional(),
    phone: z.string().optional(),
    bio: z.string().max(500).optional(),
    avatar: z.string().url().optional(),
  });

  // --- AUTHENTICATION API ROUTES ---
  // API Route: Register new user (Sign Up)
  app.post('/api/auth/register', async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { name, email, password, role, phone, bio } = parsed.data;

      const normalizedEmail = email.trim().toLowerCase();
      const existing = await appStore.getUserByEmail(normalizedEmail);
      if (existing) {
        return res.status(400).json({ error: 'An account with this email already exists. Please sign in instead.' });
      }

      const defaultAvatar = role === 'provider'
        ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200'
        : 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200';

      // Supabase Auth owns credentials when configured: pre-confirmed Auth
      // user first, then the app profile keyed by the Auth id. The plaintext
      // password is still stored hashed so the legacy path keeps working.
      if (isSupabaseAuthConfigured()) {
        const identity = await createSupabaseUser(normalizedEmail, password, name.trim());
        if (!identity) {
          return res.status(500).json({ error: 'Registration failed' });
        }
        try {
          const newUser = await appStore.createUser({
            id: identity.id,
            name: name.trim(),
            email: normalizedEmail,
            password,
            role: role === 'provider' ? 'provider' : 'client',
            phone: phone ? phone.trim() : undefined,
            bio: bio ? bio.trim() : (role === 'provider' ? 'Boutique beauty specialist at Leish! Aesthetic Marketplace.' : 'Beauty enthusiast exploring curated salon treatments.'),
            avatar: defaultAvatar,
            createdAt: new Date().toISOString()
          });
          const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
          return res.status(201).json({
            user: sanitizeUser(newUser),
            token,
            message: 'Account successfully registered!'
          });
        } catch (error: any) {
          await deleteSupabaseUser(identity.id);
          if (error?.message && /already (exists|registered)/i.test(error.message)) {
            return res.status(400).json({ error: 'An account with this email already exists. Please sign in instead.' });
          }
          return res.status(500).json({ error: 'Registration failed' });
        }
      }

      const newUser = await appStore.createUser({
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        email: normalizedEmail,
        password,
        role: role === 'provider' ? 'provider' : 'client',
        phone: phone ? phone.trim() : undefined,
        // Salon ownership is provisioned by an administrator, never claimed at signup.
        bio: bio ? bio.trim() : (role === 'provider' ? 'Boutique beauty specialist at Leish! Aesthetic Marketplace.' : 'Beauty enthusiast exploring curated salon treatments.'),
        avatar: defaultAvatar,
        createdAt: new Date().toISOString()
      });

      const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

      res.status(201).json({
        user: sanitizeUser(newUser),
        token,
        message: 'Account successfully registered!'
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // API Route: Sign In (Login)
  app.post('/api/auth/login', async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { email, password } = parsed.data;
      // Supabase Auth verifies credentials when configured; sessions stay
      // app JWTs so the client shape and middleware are unchanged.
      if (isSupabaseAuthConfigured()) {
        const normalizedEmail = email.trim().toLowerCase();
        const identity = await verifySupabasePassword(email, password);
        const user = identity
          ? (await appStore.getUserById(identity.id)) ?? (await appStore.getUserByEmail(identity.email.trim().toLowerCase()))
          : undefined;
        if (!identity || !user || user.email.trim().toLowerCase() !== normalizedEmail) {
          return res.status(401).json({ error: 'Invalid email or password.' });
        }
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        return res.json({
          user: sanitizeUser(user),
          token,
          message: `Welcome back, ${user.name}!`
        });
      }
      const normalizedEmail = email.trim().toLowerCase();
      const user = await appStore.getUserByEmail(normalizedEmail);
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const passwordValid = bcrypt.compareSync(password, user.password);
      if (!passwordValid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

      res.json({
        user: sanitizeUser(user),
        token,
        message: `Welcome back, ${user.name}!`
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Sign in failed' });
    }
  });

  // API Route: OAuth session exchange (Supabase Auth: Google + any provider).
  // The browser signs in via Supabase (lib/supabase browser client) and
  // POSTs its Supabase access token as the Bearer credential. The server
  // verifies it, finds or creates the app profile, and mints the standard
  // app JWT, so sessions stay uniform across password and OAuth sign-ins.
  app.post('/api/auth/oauth', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const supabaseToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '').trim() : '';
      if (!supabaseToken) {
        return res.status(401).json({ error: 'A sign-in token is required.' });
      }
      if (!isSupabaseAuthConfigured()) {
        return res.status(503).json({ error: 'OAuth sign-in is not configured on the server.' });
      }
      const identity = await verifySupabaseToken(supabaseToken);
      if (!identity?.email) {
        return res.status(401).json({ error: 'Invalid sign-in. Please try again.' });
      }
      const normalizedEmail = identity.email.trim().toLowerCase();
      let user = (await appStore.getUserById(identity.id)) ?? (await appStore.getUserByEmail(normalizedEmail));
      if (!user) {
        const displayName = identity.name?.trim().slice(0, 100) || normalizedEmail.split('@')[0];
        user = await appStore.createUser({
          id: identity.id,
          name: displayName,
          email: normalizedEmail,
          // Random unguessable secret: OAuth-linked accounts authenticate
          // via token exchange, never via password login.
          password: `oauth-${Date.now()}-${Math.random().toString(36).slice(2, 18)}`,
          role: 'client',
          bio: 'Signed up with OAuth.',
          avatar: identity.avatar,
          createdAt: new Date().toISOString(),
        });
      }
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      res.json({
        user: sanitizeUser(user),
        token,
        message: `Welcome${user.name ? `, ${user.name}` : ''}!`,
      });
    } catch (error: any) {
      serverError(res, 'OAuth sign-in failed');
    }
  });

  // API Route: Get current user info
  app.get('/api/auth/me', authenticateToken, (req: any, res) => {
    try {
      res.json(sanitizeUser(req.user));
    } catch (error: any) {
      serverError(res, 'Could not load profile');
    }
  });

  // API Route: Update user profile
  app.put('/api/auth/profile', authenticateToken, async (req: any, res) => {
    try {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { id, name, phone, bio, avatar } = parsed.data;

      // Users can only update their own profile
      if (req.user.id !== id) {
        return res.status(403).json({ error: 'You can only update your own profile.' });
      }

      const updated = await appStore.updateUser(id, {
        ...(name && { name: name.trim() }),
        ...(phone !== undefined && { phone }),
        ...(bio !== undefined && { bio }),
        ...(avatar && { avatar })
      });

      res.json({
        user: sanitizeUser(updated),
        message: 'Profile updated successfully!'
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Profile update failed' });
    }
  });

  // API Route: Create salon (admin-only; providers get listings linked by an administrator)
  app.post('/api/salons', authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const parsed = salonCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const details = parsed.data;
      const salon: Salon = {
        id: `salon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: details.name,
        category: details.category,
        location: details.location,
        address: details.address,
        tagline: details.tagline ?? '',
        description: details.description ?? '',
        rating: 0,
        reviewCount: 0,
        image: details.image ?? '',
        gallery: details.gallery ?? [],
        services: [],
        staff: [],
        featured: false,
        workingHours: details.workingHours ?? {},
        ...(details.type !== undefined ? { type: details.type } : {}),
        ...(details.artistTitle !== undefined ? { artistTitle: details.artistTitle } : {}),
        ...(details.yearsExperience !== undefined ? { yearsExperience: details.yearsExperience } : {}),
        ...(details.kitBrands !== undefined ? { kitBrands: details.kitBrands } : {}),
        ...(details.travelRadius !== undefined ? { travelRadius: details.travelRadius } : {}),
        ...(details.instagramHandle !== undefined ? { instagramHandle: details.instagramHandle } : {}),
        ...(details.startingPrice !== undefined ? { startingPrice: details.startingPrice } : {}),
      };
      const created = await appStore.createSalon(salon);
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.message === 'Salon already exists') {
        return res.status(409).json({ error: 'A listing with this id already exists.' });
      }
      serverError(res, 'Salon creation failed');
    }
  });

  // API Route: List all users (admin-only, passwords stripped)
  app.get('/api/users', authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const users = await appStore.getUsers();
      res.json(users.map(sanitizeUser));
    } catch (error: any) {
      serverError(res, 'Could not load users');
    }
  });

  // API Route: Update user as admin (role changes, salon linkage, profile fields)
  app.patch('/api/users/:id', authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const parsed = adminUserUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      if (Object.keys(parsed.data).length === 0) {
        return res.status(400).json({ error: 'Provide at least one field to update.' });
      }
      // An administrator cannot remove their own administrator access:
      // with a single admin seed this would lock everyone out.
      if (req.params.id === req.user.id && parsed.data.role !== undefined && parsed.data.role !== 'admin') {
        return res.status(403).json({ error: 'You cannot remove your own administrator access.' });
      }
      const patch: Partial<User> & { password?: string } = { ...parsed.data };
      if (patch.salonId !== undefined) {
        const linked = patch.salonId ? patch.salonId.trim() : '';
        if (!linked) {
          patch.salonId = undefined;
        } else {
          const salon = await appStore.getSalon(linked);
          if (!salon) {
            return res.status(404).json({ error: 'Salon not found' });
          }
          patch.salonId = linked;
        }
      }
      const updated = await appStore.updateUser(req.params.id, patch);
      res.json(sanitizeUser(updated));
    } catch (error: any) {
      if (error?.message === 'User not found') {
        return res.status(404).json({ error: 'User not found' });
      }
      if (error?.message === 'Email already registered') {
        return res.status(409).json({ error: 'Email already registered' });
      }
      serverError(res, 'User update failed');
    }
  });

  // API Route: Delete user as admin. Deliberately conservative: no
  // cascading deletes. Self-deletion, the last administrator, and accounts
  // with booking history are refused so no orphaned records or lockouts.
  app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      if (req.params.id === req.user.id) {
        return res.status(403).json({ error: 'You cannot delete your own account. Ask another administrator.' });
      }
      const target = await appStore.getUserById(req.params.id);
      if (!target) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (target.role === 'admin') {
        const admins = (await appStore.getUsers()).filter(user => user.role === 'admin');
        if (admins.length <= 1) {
          return res.status(403).json({ error: 'Cannot delete the last administrator account.' });
        }
      }
      const email = target.email.trim().toLowerCase();
      const bookings = await appStore.getBookings();
      const hasHistory = bookings.some(
        booking => booking.clientId === target.id ||
          (booking.clientEmail && booking.clientEmail.trim().toLowerCase() === email),
      );
      if (hasHistory) {
        return res.status(409).json({ error: 'This account has booking history and cannot be deleted.' });
      }
      await appStore.deleteUser(req.params.id);
      res.json({ deleted: req.params.id });
    } catch (error: any) {
      if (error?.message === 'User not found') {
        return res.status(404).json({ error: 'User not found' });
      }
      serverError(res, 'User deletion failed');
    }
  });

  // API Route: Get all salons
  app.get('/api/salons', async (req, res) => {
    try {
      const salons = await appStore.getSalons();
      res.json(salons);
    } catch (error: any) {
      res.status(500).json({ error: 'Could not load salons' });
    }
  });

  // API Route: Get single salon
  app.get('/api/salons/:id', async (req, res) => {
    try {
      const salon = await appStore.getSalon(req.params.id);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }
      res.json(salon);
    } catch (error: any) {
      res.status(500).json({ error: 'Could not load salon' });
    }
  });

  // API Route: Update salon (owner-only, validated partial field allowlist)
  app.put('/api/salons/:id', authenticateToken, requireSalonOwner, async (req: any, res) => {
    try {
      const parsed = salonUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const updated = await appStore.updateSalon(req.params.id, parsed.data);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Salon update failed' });
    }
  });

  // API Route: Add service to salon (owner-only)
  app.post('/api/salons/:id/services', authenticateToken, requireSalonOwner, async (req: any, res) => {
    try {
      const salon = await appStore.getSalon(req.params.id);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }

      const parsed = serviceCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const newService: Service = {
        id: `serv-${req.params.id}-${Date.now()}`,
        name: parsed.data.name,
        price: parsed.data.price,
        duration: parsed.data.duration,
        description: parsed.data.description || '',
        category: parsed.data.category || salon.category
      };
      const updatedServices = [...salon.services, newService];
      const updated = await appStore.updateSalon(req.params.id, { services: updatedServices });
      res.status(201).json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Service update failed' });
    }
  });

  // API Route: Edit an existing service (owner-only). The route keeps the
  // path-selected service ID rather than accepting an ID from the request
  // body, so existing bookings continue to reference the same catalogue item.
  app.put('/api/salons/:id/services/:serviceId', authenticateToken, requireSalonOwner, async (req: any, res) => {
    try {
      const salon = await appStore.getSalon(req.params.id);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }
      const service = salon.services.find(candidate => candidate.id === req.params.serviceId);
      if (!service) {
        return res.status(404).json({ error: 'Service not found' });
      }

      // Strip 'id' from request body since it's determined by the URL path
      const { id: _ignoredId, ...bodyWithoutId } = req.body;
      const parsed = serviceUpdateSchema.safeParse(bodyWithoutId);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const updatedService: Service = {
        ...service,
        ...parsed.data,
        id: service.id,
      };
      const updatedServices = salon.services.map(candidate =>
        candidate.id === service.id ? updatedService : candidate,
      );
      const updated = await appStore.updateSalon(req.params.id, { services: updatedServices });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Service update failed' });
    }
  });

  // API Route: Delete service from salon (owner-only)
  app.delete('/api/salons/:id/services/:serviceId', authenticateToken, requireSalonOwner, async (req: any, res) => {
    try {
      const salon = await appStore.getSalon(req.params.id);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }
      if (!salon.services.some(s => s.id === req.params.serviceId)) {
        return res.status(404).json({ error: 'Service not found' });
      }
      const updatedServices = salon.services.filter(s => s.id !== req.params.serviceId);
      const updated = await appStore.updateSalon(req.params.id, { services: updatedServices });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Service update failed' });
    }
  });

  // API Route: Get bookings — authenticated and scoped by identity (1.2):
  //   client    → only bookings made with their own email
  //   provider  → only bookings for the salon they manage
  //   admin     → may filter freely
  app.get('/api/bookings', authenticateToken, async (req: any, res) => {
    try {
      let bookings = await appStore.getBookings();

      if (req.user.role === 'admin') {
        const email = req.query.email as string | undefined;
        const salonId = req.query.salonId as string | undefined;
        if (email) {
          bookings = bookings.filter(b => b.clientEmail.toLowerCase() === email.toLowerCase());
        }
        if (salonId) {
          bookings = bookings.filter(b => b.salonId === salonId);
        }
      } else if (req.user.role === 'provider') {
        if (!req.user.salonId) {
          return res.status(403).json({ error: 'No salon is linked to this account.' });
        }
        bookings = bookings.filter(b => b.salonId === req.user.salonId);
      } else {
        const email = req.user.email.toLowerCase();
        bookings = bookings.filter(b => b.clientEmail.toLowerCase() === email);
      }

      res.json(bookings);
    } catch (error: any) {
      serverError(res, 'Could not load bookings');
    }
  });

  // API Route: Create booking
  app.post('/api/bookings', async (req, res) => {
    try {
      const parsed = bookingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const {
        salonId,
        serviceId,
        staffId,
        date,
        time,
        clientName,
        clientEmail,
        clientPhone,
        notes,
        isLocationEvent,
        eventVenue,
        travelSurcharge,
        attachedMoodboard
      } = parsed.data;

      const salon = await appStore.getSalon(salonId);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }

      const service = salon.services.find(s => s.id === serviceId);
      if (!service) {
        return res.status(404).json({ error: 'Service not found' });
      }

      const staff = salon.staff.find(st => st.id === staffId);
      if (!staff) {
        return res.status(404).json({ error: 'Staff member not found' });
      }

      // Determine clientId from authenticated user if available, otherwise leave undefined for anonymous bookings
      const authHeader = req.headers.authorization;
      let clientId: string | undefined;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.replace('Bearer ', '').trim();
          const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { userId?: unknown };
          if (typeof decoded.userId === 'string' && decoded.userId) {
            clientId = decoded.userId;
          }
        } catch {
          // Token invalid/expired, proceed as anonymous booking
        }
      }

      const booking: Booking = {
        id: `book-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        salonId,
        salonName: salon.name,
        salonAddress: salon.address,
        serviceId,
        serviceName: service.name,
        servicePrice: service.price,
        serviceDuration: service.duration,
        staffId,
        staffName: staff.name,
        date,
        time,
        clientName,
        clientEmail,
        clientPhone,
        clientId,
        notes,
        status: 'pending',
        createdAt: new Date().toISOString(),
        isLocationEvent: Boolean(isLocationEvent),
        eventVenue: eventVenue || undefined,
        travelSurcharge: travelSurcharge ? Number(travelSurcharge) : undefined,
        attachedMoodboard: attachedMoodboard || undefined
      };

      const created = await appStore.createBooking(booking);
      res.status(201).json(created);
    } catch (error: any) {
      serverError(res, 'Booking creation failed');
    }
  });

  // API Route: Update booking status — TR-7:
  //   the salon's provider/admin may move a booking through any status;
  //   a customer (regardless of role) may only cancel pending/confirmed bookings.
  app.patch('/api/bookings/:id/status', authenticateToken, requireBookingAccess, async (req: any, res) => {
    try {
      const parsed = updateBookingStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const managesSalon = canUpdateSalon(req.user, req.booking.salonId);
      if (!managesSalon) {
        if (parsed.data.status !== 'cancelled') {
          return res.status(403).json({ error: 'You can only cancel your own bookings.' });
        }
        if (req.booking.status !== 'pending' && req.booking.status !== 'confirmed') {
          return res.status(403).json({ error: 'You can only cancel pending or confirmed bookings.' });
        }
      }
      const updated = await appStore.updateBookingStatus(req.params.id, parsed.data.status);
      if (parsed.data.status === 'confirmed') {
        // Best-effort confirmation email. A mail skip or failure is logged
        // but must never fail the status change itself.
        const emailResult = await sendBookingConfirmation(updated);
        if (!emailResult.sent) {
          logger.debug('Skipped booking confirmation email', { bookingId: updated.id, reason: emailResult.reason ?? 'unknown' });
        }
      }
      res.json(updated);
    } catch (error: any) {
      serverError(res, 'Booking update failed');
    }
  });

  // API Route: Get reviews
  app.get('/api/reviews/:salonId', async (req, res) => {
    try {
      const reviews = await appStore.getSalonReviews(req.params.salonId);
      res.json(reviews);
    } catch (error: any) {
      serverError(res, 'Could not load reviews');
    }
  });

  // API Route: Post review — client accounts need an eligible completed
  // booking. New reviews carry both the authenticated reviewer and booking
  // identity so one booking cannot be reviewed more than once.
  app.post('/api/reviews', authenticateToken, async (req: any, res) => {
    try {
      const parsed = reviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { salonId, bookingId, rating, text } = parsed.data;
      const salon = await appStore.getSalon(salonId);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }
      if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Only client accounts can create customer reviews.' });
      }

      // If bookingId is provided, verify it exists and belongs to the requested salon
      if (bookingId) {
        const booking = await appStore.getBooking(bookingId);
        if (!booking) {
          return res.status(404).json({ error: 'Booking not found' });
        }
        if (booking.salonId !== salonId) {
          return res.status(404).json({ error: 'Booking not found for this salon' });
        }
      }

      const eligibility = await findReviewEligibility(req.user, salonId, bookingId);
      if (eligibility.duplicate) {
        return res.status(409).json({ error: 'You have already reviewed this completed booking.' });
      }
      if (!eligibility.booking) {
        return res.status(403).json({
          error: 'You can review a studio once you have a completed booking there.'
        });
      }
      const review: Review = {
        id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        salonId,
        clientName: req.user.name,
        rating,
        text,
        date: new Date().toISOString().split('T')[0],
        reviewerId: req.user.id,
        bookingId: eligibility.booking.id,
      };
      const created = await appStore.createReview(review);
      res.status(201).json(created);
    } catch (error: any) {
      if (error instanceof Error && error.message === 'Review already exists for this booking and reviewer') {
        return res.status(409).json({ error: 'You have already reviewed this completed booking.' });
      }
      serverError(res, 'Review creation failed');
    }
  });

  // API Route: Gemini AI Beauty Advisor Matcher
  app.post('/api/gemini/advice', async (req, res) => {
    try {
      const parsedInput = adviceRequestSchema.safeParse(req.body);
      if (!parsedInput.success) {
        return res.status(400).json({ error: 'Invalid advisor request.' });
      }
      const input = parsedInput.data;
      const salons = await appStore.getSalons();
      const fallback = fallbackAdvice(input, salons);

      if (!configuredGeminiKey()) {
        return res.json(fallback);
      }

      // Construct dynamic salons context for Gemini to read (cached)
      const salonsContext = await getCachedSalonsContext(() => appStore.getSalons());

      const prompt = `You are the Lead Luxury Makeup Stylist & Artistry Consultant for "Leish!", a high-end marketplace for premier makeup studios.
Your goal is to suggest exact makeup services and studios listed on our platform that best match the client's beauty profile.

Client Makeup Profile:
- Skin Type & Undertone: ${input.skinHairType}
- Desired Makeup Style / Goals: ${input.goals}
- Occasion: ${input.occasion}
- Preferred Category (if any): ${input.preferredCategory || 'Any Makeup Category'}

Here are the makeup studios and services available on Leish!:
${salonsContext}

Please analyze their profile and generate a tailored recommendation response.
Your response MUST be in valid JSON conforming to the schema:
{
  "recommendationText": "A warm, high-end personalized explanation of why these makeup services are selected for their skin tone, desired style, and occasion. Speak with elite makeup artist expertise.",
  "suggestedServices": [
    {
      "serviceName": "The exact name of the service from the list above",
      "category": "The category of the service",
      "salonName": "The exact name of the makeup studio",
      "salonId": "The exact studio id (e.g. salon-1)",
      "estimatedPrice": 99, (number)
      "reason": "Specific reason why this fits their skin profile, facial features, or occasion."
    }
  ]
}

Provide EXACT service names and studio IDs matching the ones provided above. Do not invent non-existent services. Limit your suggestions to 2 or 3 highly relevant services.`;

      try {
        const response = await withTimeout(
          Promise.resolve().then(() => aiClient.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  recommendationText: { type: Type.STRING, description: 'Elegant personal advice styling summary.' },
                  suggestedServices: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        serviceName: { type: Type.STRING },
                        category: { type: Type.STRING },
                        salonName: { type: Type.STRING },
                        salonId: { type: Type.STRING },
                        estimatedPrice: { type: Type.NUMBER },
                        reason: { type: Type.STRING },
                      },
                      required: ['serviceName', 'category', 'salonName', 'salonId', 'estimatedPrice', 'reason'],
                    },
                  },
                },
                required: ['recommendationText', 'suggestedServices'],
              },
            },
          })),
          aiTimeoutMs,
          'Advisor request',
        );
        const data = parseModelJson(response.text, adviceResponseSchema);
        return res.json(data ? { source: 'model', ...data } : fallback);
      } catch {
        return res.json(fallback);
      }
    } catch {
      return serverError(res, 'AI processing failed. Please try again.');
    }
  });

  // API Route: Gemini AI Salon Review Summarizer
  app.post('/api/gemini/summarize-reviews', async (req, res) => {
    try {
      const parsedInput = reviewSummaryRequestSchema.safeParse(req.body);
      if (!parsedInput.success) {
        return res.status(400).json({ error: 'Invalid review summary request.' });
      }
      const { salonId } = parsedInput.data;
      const salon = await appStore.getSalon(salonId);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }

      const reviews = await appStore.getSalonReviews(salonId);
      const fallback = fallbackReviewSummary(reviews.length > 0);
      if (reviews.length === 0 || !configuredGeminiKey()) {
        return res.json(fallback);
      }

      const reviewsText = clip(reviews.slice(0, 50).map(r =>
        `[Rating: ${r.rating}/5, Client: ${clip(r.clientName, 120)}] Review: "${clip(r.text, 1000)}"`,
      ).join('\n'), 18000);

      const prompt = `You are a luxury beauty concierge. Analyze the customer reviews for "${clip(salon.name, 200)}" and compile an elegant, concise 3-part summary.
Reviews to analyze:
${reviewsText}

Generate a JSON object conforming exactly to this schema:
{
  "vibe": "Describe the core interior atmosphere/vibe in a single professional, elegant sentence (e.g. 'A sanctuary of Parisian calm with meticulous hospitality')",
  "bestFor": "State what the salon is best known for according to clients in a single highly-focused sentence.",
  "tip": "Provide 1 useful customer tip derived from the reviews (e.g., booking guidelines, therapist choice, or signature services) in a single sentence."
}
Keep each field extremely concise, professional, and sophisticated. No emojis.`;

      try {
        const response = await withTimeout(
          Promise.resolve().then(() => aiClient.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  vibe: { type: Type.STRING },
                  bestFor: { type: Type.STRING },
                  tip: { type: Type.STRING },
                },
                required: ['vibe', 'bestFor', 'tip'],
              },
            },
          })),
          aiTimeoutMs,
          'Review summary request',
        );
        const data = parseModelJson(response.text, reviewSummaryResponseSchema);
        return res.json(data ? { source: 'model', ...data } : fallback);
      } catch {
        return res.json(fallback);
      }
    } catch {
      return serverError(res, 'Failed to summarize reviews. Please try again.');
    }
  });

  // --- API ROUTE: Venue Distance & On-Location Travel Calculator ---
  // Live road distance via Google Distance Matrix when GOOGLE_MAPS_SERVER_KEY
  // is configured; otherwise the long-standing deterministic sample so local
  // development and offline environments keep working. The response always
  // states which source produced it (estimateSource: 'live' | 'sample').
  const DISTANCE_HASH_MODULO = 39; // produces range 0-38
  const BASE_DISTANCE_KM = 7.5; // minimum distance offset
  const DRIVE_MINUTES_PER_KM = 1.37; // average drive time factor
  const DRIVE_MINUTES_BASE = 8; // fixed overhead (pickup, parking)
  const BASE_KIT_FEE = 50; // Mobile sanitation and lighting kit setup
  const MILEAGE_FEE_PER_KM = 1.55; // RM per km

  function sampleDistanceKm(venue: string): { distanceKm: number; estimatedDriveMinutes: number } {
    let hash = 0;
    for (let i = 0; i < venue.length; i++) {
      hash = (hash << 5) - hash + venue.charCodeAt(i);
      hash |= 0;
    }
    const distanceKm = Number((Math.abs(hash % DISTANCE_HASH_MODULO) + BASE_DISTANCE_KM).toFixed(1));
    const estimatedDriveMinutes = Math.round(distanceKm * DRIVE_MINUTES_PER_KM + DRIVE_MINUTES_BASE);
    return { distanceKm, estimatedDriveMinutes };
  }

  app.post('/api/venue/estimate-travel', async (req, res) => {
    try {
      const { salonId, venue } = req.body;
      if (!venue || !venue.trim()) {
        return res.status(400).json({ error: 'Venue name or address is required.' });
      }
      if (!salonId || !salonId.trim()) {
        return res.status(400).json({ error: 'salonId is required.' });
      }

      const salon = await appStore.getSalon(salonId);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }
      const studioAddress = salon.address;

      const live = await calcDistanceKm(studioAddress, venue.trim());
      const { distanceKm, estimatedDriveMinutes } = live
        ? {
            distanceKm: Number(live.km.toFixed(1)),
            estimatedDriveMinutes: Math.round(live.minutes),
          }
        : sampleDistanceKm(venue);
      const estimateSource = live ? 'live' : 'sample';

      const mileageFee = Number((distanceKm * MILEAGE_FEE_PER_KM).toFixed(2));
      const totalTravelFee = Math.round(BASE_KIT_FEE + mileageFee);

      res.json({
        venueName: venue.trim(),
        studioAddress,
        distanceKm,
        estimatedDriveMinutes,
        baseKitFee: BASE_KIT_FEE,
        mileageFee,
        totalTravelFee,
        estimateSource,
        serviceNote: 'Covers on-location pro lighting setup, sanitized mobile artistry trunks, and wedding morning timeline coordination.'
      });
    } catch (error: any) {
      serverError(res, 'Travel calculation failed');
    }
  });

  // --- API ROUTE: AI Virtual Lookbook & 2026 Trends Grounding ---
  app.post('/api/gemini/trends-lookbook', async (req, res) => {
    try {
      const { prompt: userPrompt, aesthetic, occasion, skinUndertone, lighting } = req.body;
      const salons = await appStore.getSalons();

      const defaultImages: Record<string, string> = {
        bridal: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=1200',
        editorial: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=1200',
        'soft-glam': 'https://images.unsplash.com/photo-1503236823255-94609f598e71?auto=format&fit=crop&q=80&w=1200',
        airbrush: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=1200',
        masterclass: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=1200'
      };

      const selectedAesthetic = aesthetic || 'bridal';
      const heroImage = defaultImages[selectedAesthetic] || defaultImages['bridal'];

      // Keep the deterministic fallback bookable against the live catalogue.
      // Hard-coded display names drift when providers edit their service menu;
      // the booking flow must receive the current canonical salon/service IDs.
      const fallbackSalon = salons.find(salon =>
        salon.category === selectedAesthetic || salon.services.some(service => service.category === selectedAesthetic),
      ) || salons[0];
      const fallbackService = fallbackSalon?.services.find(service => service.category === selectedAesthetic)
        || fallbackSalon?.services[0];

      // Fallback curated lookbook spec if Gemini is unavailable
      const fallbackLookbook = {
        id: `look-${Date.now()}`,
        lookName: selectedAesthetic === 'bridal' 
          ? 'Royal Gilded Silk Bridal' 
          : selectedAesthetic === 'editorial' 
          ? 'High-Impact Cinematic Red Carpet' 
          : 'Velvet Nude Petal Soft Glam',
        category: selectedAesthetic,
        vibeDescription: 'Elegantly sculpted complexion featuring radiant light-reflective underpainting, champagne shimmer lids, and a velvety ombre lip designed for 18-hour tearproof wear.',
        colorPalette: [
          { hex: '#E6E5E4', name: 'Champagne Rose' },
          { hex: '#90836D', name: 'Spiced Terracotta' },
          { hex: '#554B3A', name: 'Espresso Velvet' },
          { hex: '#ECEBE9', name: 'Opal Glaze' },
          { hex: '#ABA497', name: 'Golden Apricot' }
        ],
        complexion: {
          finish: 'Velvet Satin Glow',
          coverage: 'Medium Buildable',
          technique: 'Cream Underpainting & Micro-Mist 4K Airbrush'
        },
        eyeArtistry: {
          style: 'Soft Almond Smoke with Champagne Foil Inner Corner',
          lashStyle: 'Whisper-Thin Dimensional Silk Clusters'
        },
        lipFormula: {
          shade: 'Warm Honey Muted Rose',
          finish: 'Hydrated Velvet Matte with Satin Plumping Glaze',
          liner: 'Chestnut Contoured'
        },
        longevityFeatures: [
          '18-Hour Cry-Proof & Sweat-Resistant Seal',
          'Flashback-Free High Definition Silica Barrier',
          'Micro-pore Blur Technology for 4K Video'
        ],
        lightingBestFor: lighting || 'Warm Ballroom Chandelier & Sunset Golden Hour',
        groundedTrendContext: '2026 Fashion Week spotlighted "Glass Velvet" skin: ultra-dewy high points balanced by blurred, shine-controlled T-zones for seamless camera transitions.',
        recommendedSalonId: fallbackSalon?.id,
        recommendedServiceId: fallbackService?.id,
        recommendedServiceName: fallbackService?.name,
        heroImage
      };

      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
        return res.json(fallbackLookbook);
      }

      // Query Gemini 3.5 Flash with Google Search Grounding for current 2026 trend synthesis
      const searchPrompt = `You are the Executive Artistry Director for Leish! Luxury Makeup Studio Marketplace.
Search for current 2026 bridal, runway, and red-carpet makeup trends. Then generate a bespoke luxury Makeup Lookbook Specification.

Parameters:
- Desired Style: ${userPrompt || aesthetic || 'High luxury wedding makeup'}
- Aesthetic Category: ${selectedAesthetic}
- Occasion: ${occasion || 'Black Tie Evening'}
- Skin Undertone: ${skinUndertone || 'Neutral Warm'}
- Preferred Lighting: ${lighting || 'Natural Daylight & Flash Photography'}

Available Marketplace Studios:
${salons.map(s => `- ${s.name} (ID: ${s.id}, Category: ${s.category}, Top Service: ${s.services[0]?.name || 'Bridal Artistry'})`).join('\n')}

Synthesize the latest 2026 fashion week / viral beauty trends and output ONLY valid JSON matching this schema:
{
  "lookName": "Creative luxury look title (e.g. 'Gilded Velvet Champagne Bridal')",
  "category": "${selectedAesthetic}",
  "vibeDescription": "Poetic, editorial, and vivid 2-sentence description of the artistry look.",
  "colorPalette": [
    { "hex": "#HEXCODE", "name": "Color Name" },
    { "hex": "#HEXCODE", "name": "Color Name" },
    { "hex": "#HEXCODE", "name": "Color Name" },
    { "hex": "#HEXCODE", "name": "Color Name" },
    { "hex": "#HEXCODE", "name": "Color Name" }
  ],
  "complexion": {
    "finish": "e.g. Cloud Skin / Dewy Velvet / Satin Matte",
    "coverage": "e.g. Sheer Glow / Medium Buildable / 4K Full Coverage",
    "technique": "e.g. Underpainting with micro-airbrush setting veil"
  },
  "eyeArtistry": {
    "style": "e.g. Soft diffused smoked wing with crushed diamond reflect",
    "lashStyle": "e.g. Handcrafted individual mink clusters flared at outer corners"
  },
  "lipFormula": {
    "shade": "e.g. 90s Spiced Rosewood Ombré",
    "finish": "e.g. Blurred Velvet with High-Shine Core Glaze",
    "liner": "e.g. Cool Taupe Chestnut Pencil"
  },
  "longevityFeatures": [
    "Feature 1 (e.g. 18-Hour Humidity & Cry-Proof Barrier)",
    "Feature 2 (e.g. Zero-Flashback HD Micro-Silica)",
    "Feature 3 (e.g. Heat-activated fixing mist)"
  ],
  "lightingBestFor": "${lighting || 'Natural Daylight & Flash Photography'}",
  "groundedTrendContext": "1-2 sentences on how this look aligns with 2026 runway/red-carpet trends observed on Milan/Paris runways or celebrity red carpets.",
  "recommendedSalonId": "salon-1",
  "recommendedServiceName": "Service Name matching the studio"
}
Ensure colorPalette has 5 distinct harmonious hexadecimal values. Return pure JSON without markdown backticks if possible.`;

      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI request timeout')), 7000)
        );
        const aiPromise = aiClient.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: searchPrompt,
          config: {
            tools: [{ googleSearch: {} }]
          }
        });

        const response: any = await Promise.race([aiPromise, timeoutPromise]);

        if (response && response.text) {
          const cleanText = stripJsonFences(response.text);
          
          const parsed = JSON.parse(cleanText);
          parsed.id = `look-${Date.now()}`;
          parsed.heroImage = heroImage;
          return res.json(parsed);
        }
      } catch (genErr: any) {
        console.warn('[Gemini Lookbook Generator] GenAI call note:', genErr?.message || genErr);
      }

      return res.json(fallbackLookbook);
    } catch (error: any) {
      console.error('[Gemini Lookbook Generator] Error:', error);
      res.status(500).json({ error: 'Lookbook generation encountered an issue.' });
    }
  });

  // --- API ROUTE: AI Studio Review & Quality Auditor (Hybrid Inspection) ---
  app.post('/api/gemini/quality-audit', authenticateToken, async (req: any, res) => {
    try {
      const parsed = z.object({ salonId: z.string().trim().min(1).max(120) }).strict().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'A valid salonId is required.' });
      }
      const { salonId } = parsed.data;
      const salon = await appStore.getSalon(salonId);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }
      if (!canUpdateSalon(req.user, salonId)) {
        return res.status(403).json({ error: 'You do not have permission to audit this salon.' });
      }

      const reviews = await appStore.getSalonReviews(salonId);

      // Default high-grade fallback audit report
      const defaultAudit = {
        salonName: salon.name,
        overallScore: 97,
        sentimentDistribution: {
          positive: 94,
          neutral: 5,
          constructive: 1
        },
        strengths: [
          'Exemplary skin undertone matching and custom foundation blending.',
          'Punctual arrival and serene composure during high-stress wedding mornings.',
          'Longevity confirmed through 14+ hours of tears, dancing, and camera flashes.'
        ],
        improvements: [
          'Clients frequently request take-home touch-up samples of custom lip mixes.',
          'Consider adding high-lumen 5000K daylight-balanced vanity mirrors for early winter morning trials.'
        ],
        actionablePlan: [
          'Introduce complimentary "Bride Emergency Touch-Up Kits" (compact sponge, lip decant, blotting sheet).',
          'Standardize pre-consultation digital skin prep guidelines 48 hours prior to bookings.'
        ]
      };

      if (!configuredGeminiKey() || reviews.length === 0) {
        return res.json(defaultAudit);
      }

      const reviewsFormatted = reviews.map(r => `[Rating: ${r.rating}/5, Client: ${r.clientName}]: "${r.text}"`).join('\n');

      const auditPrompt = `You are an elite Luxury Beauty Quality Auditor & Salon Operations Consultant.
Analyze the following customer reviews for "${salon.name}".
Evaluate artistry precision, client hospitality, cleanliness, punctuality, and make-up durability.

Customer Reviews:
${reviewsFormatted}

Generate a structured quality audit conforming to this JSON schema:
{
  "salonName": "${salon.name}",
  "overallScore": 96, (Number from 80 to 100)
  "sentimentDistribution": {
    "positive": 92, (Percentage number)
    "neutral": 6, (Percentage number)
    "constructive": 2 (Percentage number)
  },
  "strengths": [
    "Specific artistry or hospitality strength observed in reviews",
    "Second key strength",
    "Third key strength"
  ],
  "improvements": [
    "Constructive opportunity for refinement",
    "Second operational refinement"
  ],
  "actionablePlan": [
    "High-impact actionable step for the studio director",
    "Second operational enhancement"
  ]
}
Return pure JSON.`;

      try {
        const response: any = await withTimeout(
          Promise.resolve().then(() => aiClient.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: auditPrompt,
            config: { responseMimeType: 'application/json' },
          })),
          aiTimeoutMs,
          'Quality audit request',
        );

        if (response && response.text) {
          const auditResult = JSON.parse(stripJsonFences(response.text));
          return res.json(auditResult);
        }
      } catch {
        console.warn('[Quality Audit] Model unavailable; serving fallback.');
      }

      return res.json(defaultAudit);
    } catch (error: any) {
      console.error('[Quality Audit] Error:', error);
      res.status(500).json({ error: 'Failed to complete quality audit.' });
    }
  });

  // --- API ROUTE: Multi-Turn Gemini Beauty Chatbot with Search & Maps Grounding ---
  app.post('/api/gemini/chat', async (req, res) => {
    try {
      const { messages, modelChoice = 'general', grounding = 'none', location } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Conversation messages array is required.' });
      }

      // Model mapping per user brief:
      // 'complex' -> 'gemini-3.1-pro-preview', 'general' -> 'gemini-3.5-flash', 'fast' -> 'gemini-3.1-flash-lite'
      let selectedModel = 'gemini-3.5-flash';
      if (modelChoice === 'complex') selectedModel = 'gemini-3.1-pro-preview';
      else if (modelChoice === 'fast') selectedModel = 'gemini-3.1-flash-lite';

      const salons = await appStore.getSalons();
      const directorySummary = salons.map(s => 
        `• ${s.name} (${s.type === 'mua' ? 'Independent MUA' : 'Atelier Studio'}, Rating: ${s.rating}★, Location: ${s.location}, Category: ${s.category}, Top: ${s.services[0]?.name} RM${s.services[0]?.price})`
      ).join('\n');

      const systemInstruction = `You are the Lead Master Beauty & Makeup Concierge for Leish! Aesthetic Marketplace.
You provide authoritative advice on luxury bridal, red-carpet, soft glam, and HD airbrush makeup artistry.
You can recommend independent MUAs and boutique ateliers listed on our platform.
Here is the current Leish! directory:
${directorySummary}

Tone: Sophisticated, welcoming, expert, couture aesthetic.
Always answer questions directly. When recommending studios or MUAs, cite their exact names and specialties.`;

      // Tools configuration:
      const tools: any[] = [];
      if (grounding === 'search') {
        tools.push({ googleSearch: {} });
      } else if (grounding === 'maps') {
        tools.push({ googleMaps: {} });
      }

      // Check if Gemini API key exists
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
        const lastUserMessage = messages[messages.length - 1]?.parts?.[0]?.text || '';
        return res.json({
          reply: `Welcome to Leish! Regarding "${lastUserMessage.slice(0, 40)}": for high-definition event artistry, we recommend independent MUAs like Jean-Marc Laurent for red carpet underpainting or Maison Leish Atelier for bridal suites. (Note: Running in concierge preview mode).`,
          groundingCitations: []
        });
      }

      const config: any = {
        systemInstruction,
      };

      if (tools.length > 0) {
        config.tools = tools;
      }

      try {
        const response = await aiClient.models.generateContent({
          model: selectedModel,
          contents: messages,
          config
        });

        const reply = response.text || 'Thank you for your message. How may I assist your beauty journey today?';
        
        // Extract search/maps grounding metadata if available
        const candidate = response.candidates?.[0];
        const searchChunks = candidate?.groundingMetadata?.groundingChunks || [];
        const webSearchQueries = candidate?.groundingMetadata?.webSearchQueries || [];

        return res.json({
          reply,
          groundingCitations: searchChunks.map((c: any) => ({
            title: c.web?.title || 'Web Citation',
            url: c.web?.uri || '',
          })).filter((c: any) => Boolean(c.url)),
          webSearchQueries,
          modelUsed: selectedModel
        });
      } catch (err: any) {
        console.warn('[Gemini Chat] Primary call note:', err?.message);
        // Graceful fallback to gemini-3.5-flash if pro preview quota or paid key was needed
        if (selectedModel !== 'gemini-3.5-flash') {
          const fallbackRes = await aiClient.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: messages,
            config: { systemInstruction }
          });
          return res.json({
            reply: fallbackRes.text || 'I am delighted to assist with your beauty styling questions.',
            groundingCitations: [],
            modelUsed: 'gemini-3.5-flash'
          });
        }
        throw err;
      }
    } catch (error: any) {
      console.error('[Gemini Chat Error]:', error);
      serverError(res, 'Chatbot service error.');
    }
  });

  // --- API ROUTE: Create & Edit Images using Gemini Flash Image ---
  app.post('/api/gemini/generate-image', async (req, res) => {
    try {
      const { prompt, aspectRatio = '1:1', baseImageBase64, imageMimeType = 'image/jpeg' } = req.body;

      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: 'Text prompt is required.' });
      }

      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
        // High quality aesthetic fallback if key is not configured
        return res.json({
          imageUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=1200',
          prompt,
          mode: 'preview'
        });
      }

      // Model: per prompt, use gemini-3.1-flash-image-preview (or gemini-3.1-flash-image)
      const modelName = 'gemini-3.1-flash-image-preview';

      const parts: any[] = [];
      if (baseImageBase64) {
        parts.push({
          inlineData: {
            data: baseImageBase64.replace(/^data:image\/[a-z]+;base64,/, ''),
            mimeType: imageMimeType
          }
        });
      }
      parts.push({ text: `Haute couture luxury beauty editorial photograph: ${prompt}. Professional studio lighting, poreless glass skin finish, bespoke eye design, high fashion magazine quality.` });

      try {
        const response = await aiClient.models.generateContent({
          model: modelName,
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: aspectRatio as any || '1:1'
            }
          }
        });

        let foundImageUrl: string | null = null;
        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData?.data) {
              foundImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
              break;
            }
          }
        }

        if (foundImageUrl) {
          return res.json({ imageUrl: foundImageUrl, prompt });
        }
      } catch (imgErr: any) {
        console.warn('[Gemini Flash Image] Error with preview model, trying lite image model:', imgErr?.message);
        // Fallback to gemini-3.1-flash-lite-image
        try {
          const fallbackRes = await aiClient.models.generateContent({
            model: 'gemini-3.1-flash-lite-image',
            contents: { parts },
            config: {
              imageConfig: { aspectRatio: aspectRatio as any || '1:1' }
            }
          });
          if (fallbackRes.candidates?.[0]?.content?.parts) {
            for (const part of fallbackRes.candidates[0].content.parts) {
              if (part.inlineData?.data) {
                return res.json({
                  imageUrl: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`,
                  prompt
                });
              }
            }
          }
        } catch (liteErr) {
          console.warn('[Gemini Lite Image] Also encountered error:', liteErr);
        }
      }

      // Elegant editorial photography fallback on quota exhaustion
      return res.json({
        imageUrl: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=1200',
        prompt,
        notice: 'Rendered with curated aesthetic fallback while image synthesis quota resets.'
      });
    } catch (error: any) {
      console.error('[Image Generation Error]:', error);
      serverError(res, 'Image generation failed.');
    }
  });

  // --- API ROUTE: Veo 3 Video Generation (Start) ---
  app.post('/api/gemini/generate-video', async (req, res) => {
    try {
      const { prompt, aspectRatio = '16:9' } = req.body;

      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: 'Text prompt is required.' });
      }

      const validAspect = (aspectRatio === '9:16') ? '9:16' : '16:9';

      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
        return res.json({
          operationName: 'simulated-video-operation',
          aspectRatio: validAspect,
          done: true,
          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
        });
      }

      try {
        const operation = await aiClient.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: `Cinematic 4K luxury beauty video: ${prompt}. Smooth camera pan, flattering studio rim lighting, immaculate makeup details, runway movement.`,
          config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: validAspect
          }
        });

        return res.json({
          operationName: operation.name,
          aspectRatio: validAspect,
          done: false
        });
      } catch (veoErr: any) {
        console.warn('[Veo 3 fast model note]:', veoErr?.message);
        // Try fallback to veo-3.1-lite-generate-preview
        const opLite = await aiClient.models.generateVideos({
          model: 'veo-3.1-lite-generate-preview',
          prompt: `Cinematic beauty runway video: ${prompt}`,
          config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: validAspect
          }
        });
        return res.json({
          operationName: opLite.name,
          aspectRatio: validAspect,
          done: false
        });
      }
    } catch (error: any) {
      console.error('[Veo Video Generation Error]:', error);
      // Return simulated demo video so UI experience remains seamless
      res.json({
        operationName: 'demo-runway-clip',
        aspectRatio: req.body.aspectRatio || '16:9',
        done: true,
        videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        notice: 'Video generation is temporarily unavailable.'
      });
    }
  });

  // --- API ROUTE: Veo 3 Video Status (Poll) ---
  app.post('/api/gemini/video-status', async (req, res) => {
    try {
      const { operationName } = req.body;
      if (!operationName) {
        return res.status(400).json({ error: 'Operation name is required.' });
      }

      if (operationName === 'simulated-video-operation' || operationName === 'demo-runway-clip') {
        return res.json({
          done: true,
          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
        });
      }

      const op = new GenerateVideosOperation();
      op.name = operationName;
      const updated = await aiClient.operations.getVideosOperation({ operation: op });
      const uri = updated.response?.generatedVideos?.[0]?.video?.uri;

      res.json({
        done: Boolean(updated.done),
        hasDownloadUri: Boolean(uri)
      });
    } catch (error: any) {
      console.error('[Veo Status Error]:', error);
      serverError(res, 'Video status lookup failed');
    }
  });

  // --- API ROUTE: Veo 3 Video Download Stream ---
  app.post('/api/gemini/video-download', async (req, res) => {
    try {
      const { operationName } = req.body;
      if (!operationName) {
        return res.status(400).json({ error: 'Operation name is required.' });
      }

      if (operationName === 'simulated-video-operation' || operationName === 'demo-runway-clip') {
        return res.redirect('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');
      }

      const op = new GenerateVideosOperation();
      op.name = operationName;
      const updated = await aiClient.operations.getVideosOperation({ operation: op });
      const uri = updated.response?.generatedVideos?.[0]?.video?.uri;

      if (!uri) {
        return res.status(404).json({ error: 'Video URI not ready yet.' });
      }

      const videoRes = await fetch(uri, {
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY || '' }
      });

      res.setHeader('Content-Type', 'video/mp4');
      if (videoRes.body) {
        const arrayBuf = await videoRes.arrayBuffer();
        res.send(Buffer.from(arrayBuf));
      } else {
        res.status(500).json({ error: 'Empty video stream from upstream.' });
      }
    } catch (error: any) {
      console.error('[Veo Download Error]:', error);
      serverError(res, 'Video download failed');
    }
  });

  // Express 4 does not automatically turn rejected async middleware into an
  // HTTP response. Keep this last so storage/authorization failures delegated
  // with next(error) cannot become unhandled rejections or hung requests.
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API] Unhandled request failure');
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

const app = createApp();

// When run directly (local dev/prod via `tsx dev.ts`), the dev bootstrap in
// dev.ts mounts Vite/static middleware and listens. On Vercel, the platform
// serves built assets from outputDirectory and invokes the default export
// (the Express app) for every other request — original paths preserved.
export default app;

/**
 * Structured logging & metrics helpers for production observability.
 * Import and use in route handlers instead of console.log/error.
 */

export interface LogContext {
  requestId?: string;
  userId?: string;
  salonId?: string;
  bookingId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
  [key: string]: unknown;
}

export interface MetricPoint {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level: string): boolean {
  return LEVELS[level as keyof typeof LEVELS] >= LEVELS[LOG_LEVEL as keyof typeof LEVELS];
}

function formatLog(level: string, message: string, context: LogContext = {}): string {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  return JSON.stringify(entry);
}

export const logger = {
  debug: (message: string, context?: LogContext) => {
    if (shouldLog('debug')) console.debug(formatLog('debug', message, context));
  },
  info: (message: string, context?: LogContext) => {
    if (shouldLog('info')) console.info(formatLog('info', message, context));
  },
  warn: (message: string, context?: LogContext) => {
    if (shouldLog('warn')) console.warn(formatLog('warn', message, context));
  },
  error: (message: string, context?: LogContext) => {
    if (shouldLog('error')) console.error(formatLog('error', message, context));
  },
};

/**
 * Wrap an async route handler to add request ID, latency, and structured logging.
 */
export function withLogging<T extends (...args: any[]) => Promise<any>>(
  handler: T,
  routeName: string
): T {
  return (async (...args: any[]) => {
    const req = args[0];
    const res = args[1];
    const requestId = req.headers?.['x-request-id'] ||
      req.headers?.['x-vercel-id'] ||
      `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const start = process.hrtime.bigint();
    const context: LogContext = {
      requestId,
      route: routeName,
      method: req.method,
      userId: req.user?.id,
    };

    logger.info('Request started', context);

    try {
      const result = await handler(...args);
      const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      logger.info('Request completed', { ...context, statusCode: res.statusCode, latencyMs });
      return result;
    } catch (error: any) {
      const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      logger.error('Request failed', {
        ...context,
        statusCode: res.statusCode || 500,
        latencyMs,
        error: error?.message,
        stack: error?.stack,
      });
      throw error;
    }
  }) as T;
}

/**
 * Simple in-memory metrics buffer (flush to external sink in production).
 */
const metricsBuffer: MetricPoint[] = [];
const MAX_BUFFER = 1000;

export function recordMetric(name: string, value: number, tags: Record<string, string> = {}): void {
  metricsBuffer.push({ name, value, tags, timestamp: Date.now() });
  if (metricsBuffer.length > MAX_BUFFER) metricsBuffer.shift();
}

export function getMetrics(): MetricPoint[] {
  return [...metricsBuffer];
}

export function clearMetrics(): void {
  metricsBuffer.length = 0;
}

/**
 * Pre-defined metric names for consistency.
 */
export const Metrics = {
  BOOKING_CREATED: 'booking.created',
  BOOKING_UPDATED: 'booking.updated',
  BOOKING_CANCELLED: 'booking.cancelled',
  REVIEW_CREATED: 'review.created',
  AI_ADVICE_REQUEST: 'ai.advice.request',
  AI_ADVICE_FALLBACK: 'ai.advice.fallback',
  AI_ADVICE_ERROR: 'ai.advice.error',
  AUTH_LOGIN: 'auth.login',
  AUTH_REGISTER: 'auth.register',
  AUTH_FAILURE: 'auth.failure',
  RATE_LIMIT_HIT: 'ratelimit.hit',
  DB_WRITE_LATENCY: 'db.write.latency',
  DB_READ_LATENCY: 'db.read.latency',
  BOOKING_PAID: 'booking.paid',
} as const;
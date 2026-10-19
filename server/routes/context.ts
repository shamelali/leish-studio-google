/**
 * Shared types for the Express route modules extracted from server.ts.
 */
import type { NextFunction, Request, Response } from 'express';
import type { User } from '../../src/types.ts';
import type { DataStore } from '../data-store.ts';

/** Authenticated request: `req.user` is populated by authenticateToken. */
export interface AuthenticatedRequest extends Request {
  user?: User;
  requestId?: string;
}

/** Middleware signature compatible with both plain and Authenticated requests. */
export type RouteMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => void | Promise<void>;

/** Everything a route module needs to register its endpoints. */
export interface RouteContext {
  store: DataStore;
  jwtSecret: string;
  /** Authenticate a Bearer app-JWT and attach req.user (401 otherwise). */
  authenticateToken: RouteMiddleware;
  /** 403 unless req.user is an admin. Requires authenticateToken first. */
  requireAdmin: RouteMiddleware;
  /** 403 unless req.user manages the salon in :id. Requires authenticateToken first. */
  requireSalonOwner: RouteMiddleware;
  /** Loads the booking in :id onto req.booking, 404/403 as needed. */
  requireBookingAccess: RouteMiddleware;
}

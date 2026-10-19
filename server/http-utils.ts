/**
 * Small HTTP helpers shared across the Express route modules.
 */
import type { Response } from 'express';

/**
 * Never send (or log) backend exception messages: SDK errors can contain
 * credential paths and connection details. Returns the response so callers
 * can write `return serverError(res, ...)` inside try/catch handlers.
 */
export function serverError(res: Response, message: string): Response {
  console.error('[API] Request failed');
  return res.status(500).json({ error: message });
}

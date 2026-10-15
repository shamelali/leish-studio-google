/**
 * Express type extensions for server-side types.
 */
import { User } from '../src/types';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: User;
      booking?: import('../src/types').Booking;
    }
  }
}

export {};
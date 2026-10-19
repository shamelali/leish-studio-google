/**
 * Booking lifecycle routes (extracted from server.ts): scoped listing, guest
 * contact verification, idempotent create, Billplz payment, and status moves.
 */
import type { Express } from 'express';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Booking, User } from '../../src/types.ts';
import { SlotConflictError, type IdempotencyInput } from '../data-store.ts';
import { bookingSchema, pageQuerySchema, verifyRequestSchema } from '../validation.ts';
import { DEFAULT_PAGE_LIMIT } from '../pagination.ts';
import { isEmailAddress, sendBookingConfirmation, sendVerificationCode } from '../email.ts';
import {
  isVerificationEnabled,
  isIssueThrottled,
  newVerificationRecord,
} from '../contact-verification.ts';
import { generateBookingId } from '../ids.ts';
import { serverError } from '../http-utils.ts';
import { canUpdateSalon, canPayBooking } from '../authz.ts';
import { logger, recordMetric, Metrics } from '../monitoring.ts';
import type { AuthenticatedRequest, RouteContext } from './context.ts';
import { z } from 'zod';

const JWT_EXPIRES_IN = '7d';

const updateBookingStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']),
});

export function registerBookingRoutes(app: Express, ctx: RouteContext): void {
  const { store: appStore, jwtSecret: JWT_SECRET, authenticateToken, requireBookingAccess } = ctx;

  // Billplz payment configuration (Malaysia payment gateway).
  const BILLPLZ_API_KEY = process.env.BILLPLZ_API_KEY;
  const BILLPLZ_BASE_URL = 'https://www.billplz.com/api/v3';
  const BILLPLZ_AUTH = Buffer.from(`${BILLPLZ_API_KEY}:`).toString('base64');

  /** Create a Billplz bill for a booking and return the payment URL + bill id. */
  async function createBillplzBill(params: {
    amount: number; // in MYR cents (e.g. RM150.00 = 15000)
    description: string;
    email: string;
    name: string;
    mobile?: string;
    callbackUrl: string;
    redirectUrl: string;
    metadata?: Record<string, unknown>;
  }) {
    if (!BILLPLZ_API_KEY) {
      throw new Error('Billplz is not configured on the server.');
    }
    const res = await fetch(`${BILLPLZ_BASE_URL}/bills`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${BILLPLZ_AUTH}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        collection_id: process.env.BILLPLZ_COLLECTION_ID || '',
        amount: params.amount,
        currency: 'MYR',
        description: params.description,
        email: params.email,
        name: params.name,
        mobile: params.mobile || '',
        callback_url: params.callbackUrl,
        redirect_url: params.redirectUrl,
        metadata: params.metadata,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Billplz API error (${res.status}): ${text}`);
    }
    return res.json();
  }

  // API Route: Get bookings — authenticated and scoped by identity (1.2),
  // paginated (FR-006/FR-007). Role filters are computed here and enforced
  // at the store level so durable backends never fetch full collections:
  //   client    → only bookings made with their own email
  //   provider  → only bookings for the salon they manage
  //   admin     → may filter freely
  app.get('/api/bookings', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = pageQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const params = {
        page: parsed.data.page ?? 1,
        limit: parsed.data.limit ?? DEFAULT_PAGE_LIMIT,
      };
      if (req.user!.role === 'admin') {
        res.json(await appStore.listBookings(params, {
          email: req.query.email as string | undefined,
          salonId: req.query.salonId as string | undefined,
        }));
        return;
      }
      if (req.user!.role === 'studio' || req.user!.role === 'MUA') {
        if (!req.user!.salonId) {
          return res.status(403).json({ error: 'No salon is linked to this account.' });
        }
        res.json(await appStore.listBookings(params, { salonId: req.user!.salonId }));
        return;
      }
      res.json(await appStore.listBookings(params, { email: req.user!.email }));
    } catch (error: any) {
      serverError(res, 'Could not load bookings');
    }
  });

  // API Route: Request a guest verification code (FR-001/G1). 202 for any
  // valid email (no account enumeration); a failed send is fatal (503,
  // TD-5) because a code that can silently fail verifies nothing.
  app.post('/api/bookings/verify-request', async (req, res) => {
    try {
      const parsed = verifyRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const contact = parsed.data.contact.trim().toLowerCase();
      if (!isEmailAddress(contact)) {
        return res.status(422).json({ code: 'invalid_contact', error: 'Enter a valid email address to verify.' });
      }
      const existing = await appStore.getContactVerification(contact);
      if (existing && isIssueThrottled(existing)) {
        return res.status(429).json({ code: 'issue_throttled', error: 'Please wait a minute before requesting another code.' });
      }
      const issued = newVerificationRecord(contact);
      await appStore.saveContactVerification(issued.record);
      const sent = await sendVerificationCode(contact, issued.code);
      if (!sent.sent) {
        return res.status(503).json({ code: 'verification_unavailable', error: 'We could not send a verification email right now. Please try again shortly.' });
      }
      res.status(202).json({ message: 'Verification code sent. Check your inbox.' });
    } catch (error: any) {
      serverError(res, 'Verification request failed');
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

      // Auth strictness runs BEFORE resource lookups: an invalid token must
      // always be 401, never a 404 that reveals whether a salon id exists.
      const authHeader = req.headers.authorization;
      let clientId: string | undefined;
      if (authHeader !== undefined) {
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        if (!token) {
          return res.status(401).json({ code: 'invalid_token', error: 'A Bearer token is required when an Authorization header is present. Sign in again or continue as a guest.' });
        }
        try {
          const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { userId?: unknown };
          if (typeof decoded.userId === 'string' && decoded.userId) {
            clientId = decoded.userId;
          } else {
            return res.status(401).json({ code: 'invalid_token', error: 'Your session is invalid. Sign in again or continue as a guest.' });
          }
        } catch {
          return res.status(401).json({ code: 'invalid_token', error: 'Your session has expired. Sign in again or continue as a guest.' });
        }
      }

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

      // Contact verification gate (FR-001/FR-002, D1b/G1/G2): guests must
      // present a fresh OTP for their email; authenticated users booking
      // with their own account email are implicitly verified, any other
      // contact needs the code too.
      const contactCode = parsed.data.contactCode;
      const normalizedContact = clientEmail.trim().toLowerCase();
      let contactVerified: boolean | undefined;
      const unverifiedResponse = (outcome: string) => res.status(422).json({
        code: 'contact_unverified',
        error: outcome === 'expired'
          ? 'That verification code has expired. Request a new code and try again.'
          : outcome === 'locked'
          ? 'Too many incorrect codes. Request a new verification code to continue.'
          : 'Verify this email address before booking — request a code, then enter the six digits we emailed you.',
      });
      if (isVerificationEnabled()) {
        if (clientId) {
          const account = await appStore.getUserById(clientId);
          const ownEmail = Boolean(account) && (account as User).email.trim().toLowerCase() === normalizedContact;
          if (!ownEmail) {
            const outcome = await appStore.verifyAndConsumeContact(normalizedContact, contactCode ?? '');
            if (outcome !== 'ok') return unverifiedResponse(outcome);
          }
          contactVerified = true;
        } else {
          if (!isEmailAddress(normalizedContact)) {
            return res.status(422).json({
              code: 'invalid_contact',
              error: 'Enter a valid email address so we can confirm your booking.',
            });
          }
          const outcome = await appStore.verifyAndConsumeContact(normalizedContact, contactCode ?? '');
          if (outcome !== 'ok') return unverifiedResponse(outcome);
          contactVerified = true;
        }
      }

      const booking: Booking = {
        id: generateBookingId(),
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
        // Normalized so store-level exact-match filters (FR-007) stay
        // case-insensitive in practice; matching always lowercases both sides.
        clientEmail: normalizedContact,
        clientPhone,
        clientId,
        notes,
        status: 'pending',
        createdAt: new Date().toISOString(),
        isLocationEvent: Boolean(isLocationEvent),
        eventVenue: eventVenue || undefined,
        travelSurcharge: travelSurcharge ? Number(travelSurcharge) : undefined,
        attachedMoodboard: attachedMoodboard || undefined,
        contactVerified
      };

      // Idempotent, conflict-checked create (FR-004/FR-005). The key is the
      // client's Idempotency-Key header, falling back to a payload hash so
      // plain double-submits are still deduplicated (G3). Scoped per owner:
      // a key never replays another user's booking (BR-3).
      const headerKey = Array.isArray(req.headers['idempotency-key'])
        ? req.headers['idempotency-key'][0]
        : req.headers['idempotency-key'];
      const trimmedKey = typeof headerKey === 'string' ? headerKey.trim() : '';
      const effectiveKey = trimmedKey && trimmedKey.length <= 200
        ? trimmedKey
        : createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex');
      const idempotency: IdempotencyInput = {
        key: effectiveKey,
        scope: clientId ? `user:${clientId}` : `guest:${normalizedContact}`,
      };

      let result;
      try {
        result = await appStore.createBookingIdempotent(booking, idempotency);
      } catch (error) {
        if (error instanceof SlotConflictError) {
          return res.status(409).json({
            code: 'slot_conflict',
            error: 'That time slot has just been booked. Please choose another time.',
          });
        }
        throw error;
      }
      res.status(result.replayed ? 200 : 201).json(result.booking);
      if (!result.replayed) recordMetric(Metrics.BOOKING_CREATED, 1, { salonId });
    } catch (error: any) {
      serverError(res, 'Booking creation failed');
    }
  });

  // ── Billplz payment (Malaysia gateway) ──────────────────────────────────

  // API Route: Create a Billplz bill for a pending booking. Returns the
  // Billplz payment URL to redirect the customer to.
  app.post('/api/bookings/:id/pay', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const booking = await appStore.getBooking(req.params.id);
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }
      // Only the booking client (or an admin) may initiate payment.
      if (!canPayBooking(req.user, booking)) {
        return res.status(403).json({ error: 'You can only pay for your own bookings.' });
      }
      if (booking.paymentStatus === 'paid') {
        return res.status(400).json({ error: 'This booking has already been paid.' });
      }
      if (!BILLPLZ_API_KEY) {
        return res.status(503).json({ error: 'Billplz is not configured on the server.' });
      }

      const amountCents = Math.round((booking.servicePrice + (booking.travelSurcharge || 0)) * 100);
      const origin = req.headers.origin || `https://${req.headers.host}`;
      const callbackUrl = `${origin}/api/bookings/${booking.id}/pay/callback`;
      const redirectUrl = `${origin}/booking/${booking.id}/payment`;

      const bill = await createBillplzBill({
        amount: amountCents,
        description: `Leish! booking ${booking.id} — ${booking.serviceName} at ${booking.salonName}`,
        email: booking.clientEmail,
        name: booking.clientName,
        mobile: booking.clientPhone,
        callbackUrl,
        redirectUrl,
        metadata: {
          booking_id: booking.id,
          salon_id: booking.salonId,
          service_id: booking.serviceId,
        },
      });

      await appStore.updateBookingPayment(booking.id, {
        paymentStatus: 'pending',
        paymentMethod: 'billplz',
        paymentUrl: bill.url,
      });

      res.json({
        paymentUrl: bill.url,
        billId: bill.id,
        amount: amountCents,
        currency: 'MYR',
      });
    } catch (error: any) {
      serverError(res, 'Payment initiation failed');
    }
  });

  // API Route: Billplz webhook callback — called by Billplz when payment
  // status changes. Updates the booking's paymentStatus accordingly.
  app.post('/api/bookings/:id/pay/callback', async (req: AuthenticatedRequest, res) => {
    try {
      // Billplz sends a POST with the bill id and paid status in the body.
      const { bill_id, paid } = req.body as { bill_id?: string; paid?: boolean };
      if (!bill_id) {
        return res.status(400).json({ error: 'Missing bill_id' });
      }

      const booking = await appStore.getBooking(req.params.id);
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      const newStatus = paid === true ? 'paid' : 'failed';
      await appStore.updateBookingPayment(booking.id, {
        paymentStatus: newStatus,
        paymentPaidAt: new Date().toISOString(),
      });

      recordMetric(Metrics.BOOKING_PAID, 1, { salonId: booking.salonId });

      // Return 200 so Billplz doesn't retry.
      res.status(200).json({ received: true });
    } catch (error: any) {
      serverError(res, 'Payment callback failed');
    }
  });

  // API Route: Update booking status — TR-7:
  //   the salon's provider/admin may move a booking through any status;
  //   a customer (regardless of role) may only cancel pending/confirmed bookings.
  app.patch('/api/bookings/:id/status', authenticateToken, requireBookingAccess, async (req: AuthenticatedRequest & { booking?: Booking }, res) => {
    try {
      const parsed = updateBookingStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const managesSalon = canUpdateSalon(req.user, req.booking!.salonId);
      if (!managesSalon) {
        if (parsed.data.status !== 'cancelled') {
          return res.status(403).json({ error: 'You can only cancel your own bookings.' });
        }
        if (req.booking!.status !== 'pending' && req.booking!.status !== 'confirmed') {
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
}

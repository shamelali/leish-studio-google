/**
 * Review routes (extracted from server.ts): paginated listing and the
 * booking-eligibility-gated creation flow.
 */
import type { Express } from 'express';
import { z } from 'zod';
import type { Review } from '../../src/types.ts';
import { pageQuerySchema } from '../validation.ts';
import { DEFAULT_PAGE_LIMIT } from '../pagination.ts';
import { generateReviewId } from '../ids.ts';
import { serverError } from '../http-utils.ts';
import { findReviewEligibility } from '../authz.ts';
import type { AuthenticatedRequest, RouteContext } from './context.ts';

const reviewSchema = z.object({
  salonId: z.string().min(1),
  // Kept optional for compatibility with clients that already send it; the
  // server always uses the authenticated account name instead.
  clientName: z.string().trim().min(1).max(100).optional(),
  bookingId: z.string().trim().min(1).max(120).optional(),
  rating: z.number().int().min(1).max(5),
  text: z.string().min(1).max(2000),
});

export function registerReviewRoutes(app: Express, ctx: RouteContext): void {
  const { store: appStore, authenticateToken } = ctx;

  // API Route: Get reviews (paginated envelope)
  app.get('/api/reviews/:salonId', async (req, res) => {
    try {
      const parsed = pageQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      res.json(await appStore.listSalonReviews(req.params.salonId, {
        page: parsed.data.page ?? 1,
        limit: parsed.data.limit ?? DEFAULT_PAGE_LIMIT,
      }));
    } catch (error: any) {
      serverError(res, 'Could not load reviews');
    }
  });

  // API Route: Post review — client accounts need an eligible completed
  // booking. New reviews carry both the authenticated reviewer and booking
  // identity so one booking cannot be reviewed more than once.
  app.post('/api/reviews', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
      if (req.user!.role !== 'client') {
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

      const eligibility = await findReviewEligibility(appStore, req.user!, salonId, bookingId);
      if (eligibility.duplicate) {
        return res.status(409).json({ error: 'You have already reviewed this completed booking.' });
      }
      if (!eligibility.booking) {
        return res.status(403).json({
          error: 'You can review a studio once you have a completed booking there.'
        });
      }
      const review: Review = {
        id: generateReviewId(),
        salonId,
        clientName: req.user!.name,
        rating,
        text,
        date: new Date().toISOString().split('T')[0],
        reviewerId: req.user!.id,
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
}

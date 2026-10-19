/**
 * Authorization policy (TR-7) — pure predicates shared by the route layer.
 * Enforced in middleware, not per-handler; kept side-effect free so the
 * authorization matrix is directly testable.
 */
import type { Booking, Review, User } from '../src/types.ts';

export function canUpdateSalon(user: User | undefined, salonId: string): boolean {
  return user?.role === 'admin' || (user?.role === 'studio' && user.salonId === salonId);
}

export function canModifyBooking(user: User | undefined, booking: Booking): boolean {
  if (!user) return false;
  return (
    canUpdateSalon(user, booking.salonId) ||
    (booking.clientId !== undefined && booking.clientId === user.id) ||
    // Fallback for legacy bookings without clientId: compare emails (case-insensitive)
    (booking.clientId === undefined && booking.clientEmail.toLowerCase() === user.email.toLowerCase())
  );
}

/** Whether the user may read/modify the given booking (used by payment routes). */
export function canPayBooking(user: User | undefined, booking: Booking): boolean {
  if (!user) return false;
  return !booking.clientId || booking.clientId === user.id || user.role === 'admin';
}

export interface ReviewEligibility {
  booking?: Booking;
  duplicate: boolean;
}

/**
 * Determines whether `user` may review `salonId`: they need a completed
 * booking there, and one booking can only be reviewed once per reviewer.
 */
interface ReviewEligibilityStore {
  getBookings(): Booking[] | Promise<Booking[]>;
  getSalonReviews(salonId: string): Review[] | Promise<Review[]>;
}

export async function findReviewEligibility(
  store: ReviewEligibilityStore,
  user: User,
  salonId: string,
  requestedBookingId?: string,
): Promise<ReviewEligibility> {
  const [bookings, reviews] = await Promise.all([
    store.getBookings(),
    store.getSalonReviews(salonId),
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
}

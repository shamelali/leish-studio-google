/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, MapPin, Clock, DollarSign, XCircle, Star, MessageSquarePlus, CheckCircle, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { Booking, Review, User } from '../types';
import { bookingsApi, reviewsApi } from '../lib/api';

interface ClientPortalProps {
  currentUser: User | null;
  userEmail: string;
  onOpenAuth: (mode: 'signin' | 'signup') => void;
}

export default function ClientPortal({ 
  currentUser,
  userEmail, 
  onOpenAuth 
}: ClientPortalProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Review states
  const [selectedBookingForReview, setSelectedBookingForReview] = useState<Booking | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  // Bookings are scoped server-side to the signed-in account (TR-7), so the
  // feed only loads when there is an authenticated user. Guests get a
  // sign-in prompt instead of the old email-lookup form.
  useEffect(() => {
    if (currentUser) {
      fetchBookings();
    } else {
      setBookings([]);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.email]);

  const fetchBookings = async () => {
    setLoadingBookings(true);
    setError(null);
    try {
      const data = (await bookingsApi.getAll()) as Booking[];
      // Sort bookings: newest first
      data.sort((a: Booking, b: Booking) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBookings(data);
    } catch (err: any) {
      setError(err.message || 'Error fetching bookings');
    } finally {
      setLoadingBookings(false);
    }
  };

  const handleCancelBooking = async (id: string) => {
    if (!window.confirm('Are you sure you want to cancel this beauty booking?')) return;

    try {
      setError(null);
      await bookingsApi.updateStatus(id, 'cancelled');
      fetchBookings();
    } catch (err: any) {
      console.error('Failed to cancel appointment', err);
      setError(err.message || 'We could not cancel this appointment. Please try again.');
    }
  };

  const handleOpenReviewForm = (booking: Booking) => {
    setSelectedBookingForReview(booking);
    setReviewRating(5);
    setReviewText('');
    setReviewSuccess(false);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookingForReview || !reviewText.trim()) return;

    setSubmittingReview(true);
    try {
      setError(null);
      await reviewsApi.create({
        salonId: selectedBookingForReview.salonId,
        clientName: selectedBookingForReview.clientName,
        rating: reviewRating,
        text: reviewText
      });

      setReviewSuccess(true);
      // Mark the booking as completed/reviewed locally so they don't review twice in same session if desired
      setTimeout(() => {
        setSelectedBookingForReview(null);
        setReviewSuccess(false);
      }, 2000);
    } catch (err: any) {
      console.error('Review submission failed', err);
      setError(err.message || 'We could not save your review. Please try again.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const getStatusBadge = (status: Booking['status']) => {
    switch (status) {
      case 'pending':
        return <span className="rounded-full bg-warning-surface/10 px-2.5 py-0.5 text-[9px] font-mono text-warning uppercase">Pending Review</span>;
      case 'confirmed':
        return <span className="rounded-full bg-info-surface/10 px-2.5 py-0.5 text-[9px] font-mono text-info uppercase">Confirmed</span>;
      case 'completed':
        return <span className="rounded-full bg-success-surface/10 px-2.5 py-0.5 text-[9px] font-mono text-success uppercase">Completed</span>;
      case 'cancelled':
        return <span className="rounded-full bg-danger-surface/10 px-2.5 py-0.5 text-[9px] font-mono text-danger uppercase">Cancelled</span>;
    }
  };

  const formattedDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Account Status / Sync bar */}
      {currentUser ? (
        <div className="rounded-2xl border border-accent-soft/30 bg-gradient-to-r from-inset to-recessed p-5 shadow-lg mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="h-12 w-12 rounded-full overflow-hidden border border-accent-soft/60 bg-surface flex items-center justify-center shrink-0">
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt={currentUser.name} className="h-full w-full object-cover" />
              ) : (
                <span className="font-serif text-lg text-fg">{currentUser.name.charAt(0)}</span>
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-serif text-base font-semibold text-fg">{currentUser.name}</h3>
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/20 text-fg border border-accent-soft/40">
                  {currentUser.role === 'provider' ? 'Studio Director' : 'VIP Client'}
                </span>
              </div>
              <p className="text-xs text-fg-muted">
                Syncing makeup appointments for <span className="text-fg font-mono">{userEmail}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => onOpenAuth('signin')}
              className="text-xs font-mono text-fg hover:text-fg px-3 py-1.5 rounded-lg border border-line bg-inset hover:border-accent-soft/50 transition-colors"
            >
              Switch Account
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-accent-soft/40 bg-gradient-to-br from-panel-mid to-recessed p-6 shadow-xl mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center space-x-1.5 rounded-full bg-accent/20 px-3 py-1 text-[11px] text-fg border border-accent-soft/40 mb-2">
                <Sparkles className="h-3 w-3 text-fg" />
                <span>Leish! Member Portal</span>
              </div>
              <h2 className="font-serif text-xl font-semibold text-fg">Sign in to Access Your Appointments</h2>
              <p className="text-xs text-fg-muted max-w-md mt-1">
                Keep track of upcoming sessions, manage booking cancellations, and write verified reviews for your favorite ateliers.
              </p>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenAuth('signin')}
                className="rounded-xl border border-line bg-recessed px-4 py-2.5 text-xs font-medium text-fg hover:border-accent hover:bg-panel-mid transition-all"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('signup')}
                className="rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-on-primary shadow-md shadow-accent/20 hover:brightness-110 transition-all"
              >
                Create Account
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Main Panel */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h2 className="font-serif text-xl font-bold text-fg">Appointments Feed</h2>
          <span className="font-mono text-xs text-fg-muted">{bookings.length} reservations</span>
        </div>

        {loadingBookings ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-accent-text" />
          </div>
        ) : !currentUser ? (
          <div className="text-center py-16 border border-line rounded-2xl bg-panel space-y-3">
            <Calendar className="h-8 w-8 text-fg-dim mx-auto" />
            <div className="space-y-1">
              <p className="font-serif text-sm font-semibold text-fg">Sign in to see your appointments</p>
              <p className="text-xs text-fg-muted max-w-xs mx-auto">
                Bookings are tied to your Leish! account. Sign in or create one to view, cancel, or review your sessions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenAuth('signin')}
              className="rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-on-primary shadow-md shadow-accent/20 hover:brightness-110 transition-all cursor-pointer"
            >
              Sign In
            </button>
          </div>
        ) : error ? (

          <div className="text-center py-12 border border-accent-soft/20 bg-accent/5 rounded-xl text-xs text-fg space-y-2">
            <AlertCircle className="h-6 w-6 text-accent-text mx-auto" />
            <p>{error}</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-16 border border-line rounded-2xl bg-panel space-y-3">
            <Calendar className="h-8 w-8 text-fg-dim mx-auto" />
            <div className="space-y-1">
              <p className="font-serif text-sm font-semibold text-fg">No booked appointments found</p>
              <p className="text-xs text-fg-muted max-w-xs mx-auto">Discover hair, nails, and facials on our home tab to lock in your first premium reservation!</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className="rounded-xl border border-line bg-panel p-5 sm:p-6 hover:border-line transition-all duration-300 space-y-4"
              >
                {/* 1. Header block */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-line/50 pb-3 gap-2">
                  <div>
                    <h3 className="font-sans font-bold text-sm text-fg">{booking.serviceName}</h3>
                    <p className="text-xs text-fg font-serif mt-0.5">{booking.salonName}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(booking.status)}
                    <span className="text-[10px] font-mono text-fg-dim">#{booking.id}</span>
                  </div>
                </div>

                {/* 2. Metadata Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                  <div className="space-y-0.5">
                    <p className="text-[9px] text-fg-dim uppercase">Schedule</p>
                    <div className="flex items-center space-x-1 text-fg-muted">
                      <Calendar className="h-3.5 w-3.5 text-accent-text shrink-0" />
                      <span className="truncate">{formattedDate(booking.date)}</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-[9px] text-fg-dim uppercase">Time</p>
                    <div className="flex items-center space-x-1 text-fg-muted">
                      <Clock className="h-3.5 w-3.5 text-accent-text shrink-0" />
                      <span>{booking.time} ({booking.serviceDuration} min)</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-[9px] text-fg-dim uppercase">Specialist</p>
                    <div className="flex items-center space-x-1 text-fg-muted">
                      <CheckCircle className="h-3.5 w-3.5 text-accent-text shrink-0" />
                      <span className="truncate">{booking.staffName}</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-[9px] text-fg-dim uppercase">Paid Amount</p>
                    <div className="flex items-center space-x-1 text-fg">
                      <DollarSign className="h-3.5 w-3.5 text-accent-text shrink-0" />
                      <span className="font-bold text-sm font-serif">RM {booking.servicePrice}</span>
                    </div>
                  </div>
                </div>

                {booking.isLocationEvent && booking.eventVenue && (
                  <div className="flex items-center gap-1.5 text-xs text-accent-text/90 bg-warning-surface/10 px-3 py-1.5 rounded-lg border border-warning-border/20">
                    <span className="font-mono text-[10px] uppercase font-bold text-accent-text">On-Location Destination:</span>
                    <span className="truncate">{booking.eventVenue}</span>
                  </div>
                )}

                {booking.attachedMoodboard && (
                  <div className="p-3 rounded-lg bg-accent/10 border border-accent-soft/30 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase text-fg font-semibold">
                        Attached Artistry Lookbook
                      </span>
                      <span className="text-xs font-serif font-bold text-fg">
                        {booking.attachedMoodboard.lookName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {booking.attachedMoodboard.palette?.map((swatch, idx) => (
                        <div 
                          key={idx} 
                          title={swatch.name}
                          className="h-3 w-3 rounded-full border border-fg/20"
                          style={{ backgroundColor: swatch.hex }}
                        />
                      ))}
                      <span className="text-[10px] text-fg-muted ml-2 truncate">
                        {booking.attachedMoodboard.lipFormula}
                      </span>
                    </div>
                  </div>
                )}

                {booking.notes && (
                  <p className="text-xs leading-relaxed text-fg-dim italic bg-surface/20 p-2.5 rounded-lg border border-line">
                    Notes: "{booking.notes}"
                  </p>
                )}

                {/* 3. Action Buttons */}
                <div className="flex justify-end space-x-2 pt-2 border-t border-line/50">
                  {(booking.status === 'pending' || booking.status === 'confirmed') && (
                    <button
                      onClick={() => handleCancelBooking(booking.id)}
                      className="inline-flex items-center space-x-1.5 rounded-lg border border-accent-soft/20 bg-accent/5 text-danger hover:bg-accent/10 px-4 py-2 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Cancel Appointment</span>
                    </button>
                  )}

                  {booking.status === 'completed' && (
                    <button
                      onClick={() => handleOpenReviewForm(booking)}
                      className="inline-flex items-center space-x-1.5 rounded-lg border border-fg/10 bg-panel/5 text-fg hover:bg-panel/10 px-4 py-2 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5 text-fg" />
                      <span>Leave Studio Review</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review Submission Popup overlay */}
      <AnimatePresence>
        {selectedBookingForReview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedBookingForReview(null)}
              className="absolute inset-0 bg-canvas/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-line bg-panel p-6 shadow-2xl"
            >
              {reviewSuccess ? (
                <div className="text-center py-8 space-y-4">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-surface/10">
                    <CheckCircle className="h-6 w-6 text-success" />
                  </div>
                  <h3 className="font-serif text-lg font-medium text-fg">Review Submitted!</h3>
                  <p className="text-xs text-fg-muted">Thank you for sharing your experience at {selectedBookingForReview.salonName}.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmitReview} className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-serif text-base font-semibold text-fg">Leave Customer Review</h3>
                    <button
                      type="button"
                      onClick={() => setSelectedBookingForReview(null)}
                      className="text-fg-muted hover:text-fg"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="text-xs text-fg-muted">
                    Rate your {selectedBookingForReview.serviceName} at {selectedBookingForReview.salonName}.
                  </p>

                  {/* Rating Selector */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-fg uppercase block">Rating Star Scale</label>
                    <div className="flex space-x-1.5 pt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          className="text-fg-muted hover:scale-115 transition-transform"
                        >
                          <Star
                            className={`h-6 w-6 ${
                              star <= reviewRating ? 'fill-accent-text text-accent-text' : 'text-fg-dim'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Content input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-fg uppercase block">Detailed Feedback</label>
                    <textarea
                      required
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      placeholder="Tell other clients about the service, stylist attention, and salon environment..."
                      rows={4}
                      className="w-full rounded-lg border border-accent-soft bg-surface/40 px-3 py-2.5 text-xs sm:text-sm text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none focus:ring-1 focus:ring-accent-strong"
                    />
                  </div>

                  {/* CTAs */}
                  <div className="flex space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedBookingForReview(null)}
                      className="w-1/3 rounded-lg border border-line py-2 text-xs font-semibold text-fg-muted hover:bg-surface"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingReview}
                      className="flex-1 flex items-center justify-center space-x-1.5 rounded-lg bg-primary py-2 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                    >
                      {submittingReview ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <span>Post Review</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

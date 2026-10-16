import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Booking, Review, Salon } from '../src/types.ts';
import type { DataStore, StoredUser } from './data-store.ts';

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const emailKey = (email: string) => createHash('sha256').update(normalizeEmail(email)).digest('hex');
const reviewClaimKey = (reviewerId: string, bookingId: string) =>
  createHash('sha256').update(`${reviewerId}:${bookingId}`).digest('hex');

function supabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-only; never expose the service key as VITE_*).',
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}

/** Postgres-backed store: one row per entity, whole object in `data`. Reads never use a process-wide cache. */
export class SupabaseStore implements DataStore {
  private readonly db: SupabaseClient;

  constructor(client?: SupabaseClient) {
    // Never eagerly touch the network here; failures surface per call.
    this.db = client ?? supabaseClient();
  }

  // Each mutation already awaits its commit; there is no buffered state.
  async save(): Promise<void> {}

  private async rows<T>(table: string, build: { column?: string; value?: string } = {}): Promise<T[]> {
    let query = this.db.from(table).select('data');
    if (build.column) query = query.eq(build.column, build.value);
    const { data, error } = await query;
    if (error) throw new Error(`Supabase ${table} read failed: ${error.message}`);
    return (data ?? []).map(row => (row as { data: T }).data);
  }

  private async rowById<T>(table: string, id: string): Promise<T | undefined> {
    const { data, error } = await this.db.from(table).select('data').eq('id', id).maybeSingle();
    if (error) throw new Error(`Supabase ${table} read failed: ${error.message}`);
    return (data as { data: T } | null)?.data;
  }

  async getSalons(): Promise<Salon[]> {
    return this.rows<Salon>('salons');
  }

  async getSalon(id: string): Promise<Salon | undefined> {
    return this.rowById<Salon>('salons', id);
  }

  async createSalon(salon: Salon): Promise<Salon> {
    const { error } = await this.db.from('salons').insert({ id: salon.id, data: salon });
    if (error) {
      if (isUniqueViolation(error)) throw new Error('Salon already exists');
      throw new Error(`Supabase salon create failed: ${error.message}`);
    }
    return salon;
  }

  async updateSalon(id: string, updates: Partial<Salon>): Promise<Salon> {
    const current = await this.getSalon(id);
    if (!current) throw new Error('Makeup Studio not found');
    const salon = { ...current, ...updates, id };
    const { error } = await this.db.from('salons').update({ data: salon }).eq('id', id);
    if (error) throw new Error(`Supabase salon update failed: ${error.message}`);
    return salon;
  }

  async getBookings(): Promise<Booking[]> {
    const docs = await this.rows<Booking>('bookings');
    return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    return this.rowById<Booking>('bookings', id);
  }

  async createBooking(booking: Booking): Promise<Booking> {
    const { error } = await this.db.from('bookings').insert({
      id: booking.id,
      salon_id: booking.salonId,
      client_email: booking.clientEmail,
      data: booking,
    });
    if (error) throw new Error(`Supabase booking create failed: ${error.message}`);
    return booking;
  }

  async updateBookingStatus(id: string, status: Booking['status']): Promise<Booking> {
    const current = await this.getBooking(id);
    if (!current) throw new Error('Booking not found');
    const booking = { ...current, status };
    const { error } = await this.db.from('bookings').update({ data: booking }).eq('id', id);
    if (error) throw new Error(`Supabase booking update failed: ${error.message}`);
    return booking;
  }

  async getSalonReviews(salonId: string): Promise<Review[]> {
    const docs = await this.rows<Review>('reviews', { column: 'salon_id', value: salonId });
    return docs.sort((a, b) => b.date.localeCompare(a.date));
  }

  async createReview(review: Review): Promise<Review> {
    const existing = await this.rowById<Review>('reviews', review.id);
    if (existing) throw new Error('Review already exists');
    const claimKey = review.reviewerId && review.bookingId ? reviewClaimKey(review.reviewerId, review.bookingId) : null;
    if (claimKey) {
      const { data: claim, error: claimError } = await this.db
        .from('review_claims')
        .select('claim_key')
        .eq('claim_key', claimKey)
        .maybeSingle();
      if (claimError) throw new Error(`Supabase review claim read failed: ${claimError.message}`);
      if (claim) throw new Error('Review already exists for this booking and reviewer');
    }
    if (review.reviewerId && review.bookingId) {
      const siblings = await this.getSalonReviews(review.salonId);
      if (siblings.some(item => item.reviewerId === review.reviewerId && item.bookingId === review.bookingId)) {
        throw new Error('Review already exists for this booking and reviewer');
      }
    }
    const { error } = await this.db.from('reviews').insert({
      id: review.id,
      salon_id: review.salonId,
      data: review,
    });
    if (error) {
      if (isUniqueViolation(error)) throw new Error('Review already exists');
      throw new Error(`Supabase review create failed: ${error.message}`);
    }
    if (claimKey) {
      const { error: claimInsertError } = await this.db.from('review_claims').insert({
        claim_key: claimKey,
        reviewer_id: review.reviewerId,
        booking_id: review.bookingId,
        review_id: review.id,
        salon_id: review.salonId,
      });
      if (claimInsertError && !isUniqueViolation(claimInsertError)) {
        throw new Error(`Supabase review claim create failed: ${claimInsertError.message}`);
      }
    }
    const salon = await this.getSalon(review.salonId);
    if (salon) {
      const siblings = await this.getSalonReviews(review.salonId);
      const others = siblings.filter(item => item.id !== review.id);
      const count = others.length + 1;
      const rating = Number(((others.reduce((sum, item) => sum + item.rating, 0) + review.rating) / count).toFixed(1));
      await this.updateSalon(review.salonId, { rating, reviewCount: count });
    }
    return review;
  }

  async getUsers(): Promise<StoredUser[]> {
    return this.rows<StoredUser>('users');
  }

  async getUserById(id: string): Promise<StoredUser | undefined> {
    return this.rowById<StoredUser>('users', id);
  }

  async getUserByEmail(email: string): Promise<StoredUser | undefined> {
    const normalized = normalizeEmail(email);
    const { data: claim, error: claimError } = await this.db
      .from('user_emails')
      .select('user_id')
      .eq('email_key', emailKey(normalized))
      .maybeSingle();
    if (claimError) throw new Error(`Supabase email claim read failed: ${claimError.message}`);
    let user: StoredUser | undefined;
    if (claim) {
      user = await this.getUserById((claim as { user_id: string }).user_id);
    } else {
      const { data, error } = await this.db
        .from('users')
        .select('data')
        .ilike('email', normalized)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Supabase user lookup failed: ${error.message}`);
      user = (data as { data: StoredUser } | null)?.data;
    }
    return user && normalizeEmail(user.email) === normalized ? user : undefined;
  }

  async createUser(user: StoredUser): Promise<StoredUser> {
    const normalized = normalizeEmail(user.email);
    const record = { ...user, email: normalized, password: await bcrypt.hash(user.password, 10) };
    const { data: claim, error: claimError } = await this.db
      .from('user_emails')
      .select('user_id')
      .eq('email_key', emailKey(normalized))
      .maybeSingle();
    if (claimError) throw new Error(`Supabase email claim read failed: ${claimError.message}`);
    if (claim) throw new Error('Email already registered');
    if (await this.getUserById(user.id)) throw new Error('User already exists');
    const { data: emailMatch, error: emailMatchError } = await this.db
      .from('users')
      .select('id')
      .ilike('email', normalized)
      .limit(1);
    if (emailMatchError) throw new Error(`Supabase user lookup failed: ${emailMatchError.message}`);
    if (emailMatch && emailMatch.length > 0) throw new Error('Email already registered');
    const { error: userError } = await this.db.from('users').insert({
      id: user.id,
      email: normalized,
      data: record,
    });
    if (userError) {
      if (isUniqueViolation(userError)) throw new Error('Email already registered');
      throw new Error(`Supabase user create failed: ${userError.message}`);
    }
    const { error: claimInsertError } = await this.db
      .from('user_emails')
      .insert({ email_key: emailKey(normalized), user_id: user.id });
    if (claimInsertError) {
      if (isUniqueViolation(claimInsertError)) throw new Error('Email already registered');
      throw new Error(`Supabase email claim create failed: ${claimInsertError.message}`);
    }
    return record;
  }

  async updateUser(id: string, updates: Partial<StoredUser>): Promise<StoredUser> {
    const original = await this.getUserById(id);
    if (!original) throw new Error('User not found');
    const patch = { ...updates };
    if (patch.password) patch.password = await bcrypt.hash(patch.password, 10);
    const oldEmail = normalizeEmail(original.email);
    const nextEmail = patch.email === undefined ? oldEmail : normalizeEmail(patch.email);
    if (nextEmail !== oldEmail) {
      const { data: claim, error: claimError } = await this.db
        .from('user_emails')
        .select('user_id')
        .eq('email_key', emailKey(nextEmail))
        .maybeSingle();
      if (claimError) throw new Error(`Supabase email claim read failed: ${claimError.message}`);
      if (claim) throw new Error('Email already registered');
      const { data: emailMatch, error: emailMatchError } = await this.db
        .from('users')
        .select('id')
        .ilike('email', nextEmail)
        .limit(2);
      if (emailMatchError) throw new Error(`Supabase user lookup failed: ${emailMatchError.message}`);
      if ((emailMatch ?? []).some(row => (row as { id: string }).id !== id)) {
        throw new Error('Email already registered');
      }
      const { error: deleteError } = await this.db.from('user_emails').delete().eq('email_key', emailKey(oldEmail));
      if (deleteError) throw new Error(`Supabase email claim delete failed: ${deleteError.message}`);
      const { error: claimInsertError } = await this.db
        .from('user_emails')
        .insert({ email_key: emailKey(nextEmail), user_id: id });
      if (claimInsertError) {
        if (isUniqueViolation(claimInsertError)) throw new Error('Email already registered');
        throw new Error(`Supabase email claim create failed: ${claimInsertError.message}`);
      }
    }
    const record = { ...original, ...patch, email: nextEmail, id };
    const { error } = await this.db.from('users').update({ email: nextEmail, data: record }).eq('id', id);
    if (error) {
      if (isUniqueViolation(error)) throw new Error('Email already registered');
      throw new Error(`Supabase user update failed: ${error.message}`);
    }
    return record;
  }
}

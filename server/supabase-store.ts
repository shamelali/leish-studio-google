import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Booking, Review, Salon } from '../src/types.ts';
import type {
  BookingListFilter,
  DataStore,
  IdempotencyInput,
  BookingWriteResult,
  StoredUser,
} from './data-store.ts';
import {
  SlotConflictError,
  idempotencyExpiry,
  isIdempotencyLive,
} from './data-store.ts';
import type { ContactVerificationRecord } from './contact-verification.ts';
import { classifyAttempt, contactKey } from './contact-verification.ts';
import type { PageParams, Paginated } from './pagination.ts';
import { pageOffset, paginate } from './pagination.ts';
import { bookingsConflict, slotEndIso, slotStartIso } from './slots.ts';

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
    return this.rows<Salon>('leish_salons');
  }

  async listSalons(params: PageParams): Promise<Paginated<Salon>> {
    // App ids are `salon-<ms>-*` (chronological); id order is deterministic
    // and needs no extra column (migration 002 adds ordering columns only
    // where temporal semantics are required: bookings, reviews).
    const { data, error, count } = await this.db
      .from('leish_salons')
      .select('data', { count: 'exact' })
      .order('id', { ascending: true })
      .range(pageOffset(params), pageOffset(params) + params.limit - 1);
    if (error) throw new Error(`Supabase salons page failed: ${error.message}`);
    return paginate((data ?? []).map(row => (row as { data: Salon }).data), count ?? 0, params);
  }

  async getSalon(id: string): Promise<Salon | undefined> {
    return this.rowById<Salon>('leish_salons', id);
  }

  async createSalon(salon: Salon): Promise<Salon> {
    const { error } = await this.db.from('leish_salons').insert({ id: salon.id, data: salon });
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
    const { error } = await this.db.from('leish_salons').update({ data: salon }).eq('id', id);
    if (error) throw new Error(`Supabase salon update failed: ${error.message}`);
    return salon;
  }

  async getBookings(): Promise<Booking[]> {
    const docs = await this.rows<Booking>('leish_bookings');
    return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listBookings(params: PageParams, filter: BookingListFilter = {}): Promise<Paginated<Booking>> {
    // Emails are normalized to lowercase at creation (server.ts), so exact
    // match is case-insensitive in practice (see bookings_by_client_email_exact).
    let query = this.db.from('leish_bookings').select('data', { count: 'exact' });
    if (filter.salonId) query = query.eq('salon_id', filter.salonId);
    if (filter.email) query = query.eq('client_email', filter.email.toLowerCase());
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(pageOffset(params), pageOffset(params) + params.limit - 1);
    if (error) throw new Error(`Supabase bookings page failed: ${error.message}`);
    return paginate((data ?? []).map(row => (row as { data: Booking }).data), count ?? 0, params);
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    return this.rowById<Booking>('leish_bookings', id);
  }

  async createBooking(booking: Booking): Promise<Booking> {
    const { error } = await this.db.from('leish_bookings').insert({
      id: booking.id,
      salon_id: booking.salonId,
      client_email: booking.clientEmail,
      created_at: booking.createdAt,
      data: booking,
    });
    if (error) throw new Error(`Supabase booking create failed: ${error.message}`);
    return booking;
  }

  async createBookingIdempotent(booking: Booking, idempotency: IdempotencyInput): Promise<BookingWriteResult> {
    // Hashing keeps keys byte-safe no matter what a client sends.
    const idemKey = createHash('sha256').update(`${idempotency.scope}:${idempotency.key}`).digest('hex');
    const now = Date.now();

    // 1. Replay check (AC-007).
    const { data: existingKey, error: keyReadError } = await this.db
      .from('leish_idempotency_keys')
      .select('booking_id, expires_at')
      .eq('idem_key', idemKey)
      .maybeSingle();
    if (keyReadError) throw new Error(`Supabase idempotency read failed: ${keyReadError.message}`);
    if (existingKey && isIdempotencyLive((existingKey as { expires_at: string }).expires_at, now)) {
      const original = await this.getBooking((existingKey as { booking_id: string }).booking_id);
      if (original) return { booking: original, replayed: true };
    }

    // 2. Application-level pre-check for a friendly 409 (the exclusion
    // constraint from migration 003 is the authoritative race arbiter).
    const { data: candidates, error: conflictReadError } = await this.db
      .from('leish_bookings')
      .select('data')
      .eq('salon_id', booking.salonId)
      .eq('staff_id', booking.staffId)
      .eq('booking_date', booking.date);
    if (conflictReadError) throw new Error(`Supabase booking conflict read failed: ${conflictReadError.message}`);
    const conflict = (candidates ?? [])
      .map(row => (row as { data: Booking }).data)
      .some(candidate => candidate.status !== 'cancelled' && bookingsConflict(candidate, booking));
    if (conflict) throw new SlotConflictError();

    // 3. Insert. A concurrent same-slot insert trips the exclusion
    // constraint (23P01) → slot conflict.
    const { error } = await this.db.from('leish_bookings').insert({
      id: booking.id,
      salon_id: booking.salonId,
      client_email: booking.clientEmail,
      created_at: booking.createdAt,
      staff_id: booking.staffId,
      booking_date: booking.date,
      status: booking.status,
      starts_at: slotStartIso(booking.date, booking.time),
      ends_at: slotEndIso(booking.date, booking.time, booking.serviceDuration),
      data: booking,
    });
    if (error) {
      if ((error as { code?: unknown }).code === '23P01') throw new SlotConflictError();
      throw new Error(`Supabase booking create failed: ${error.message}`);
    }

    // 4. Claim the key; a lost race replays the winner (AC-008).
    const { error: keyError } = await this.db.from('leish_idempotency_keys').insert({
      idem_key: idemKey,
      booking_id: booking.id,
      expires_at: idempotencyExpiry(now),
    });
    if (keyError) {
      if (isUniqueViolation(keyError)) {
        const { data: winner, error: winnerError } = await this.db
          .from('leish_idempotency_keys')
          .select('booking_id, expires_at')
          .eq('idem_key', idemKey)
          .maybeSingle();
        if (!winnerError && winner && isIdempotencyLive((winner as { expires_at: string }).expires_at, now)) {
          const original = await this.getBooking((winner as { booking_id: string }).booking_id);
          if (original) return { booking: original, replayed: true };
        }
      }
      throw new Error(`Supabase idempotency claim failed: ${keyError.message}`);
    }
    return { booking, replayed: false };
  }

  async saveContactVerification(record: ContactVerificationRecord): Promise<void> {
    const { error } = await this.db.from('leish_contact_verifications').upsert({
      contact_key: contactKey(record.contact),
      code_hash: record.codeHash,
      attempts: record.attempts,
      expires_at: record.expiresAt,
    });
    if (error) throw new Error(`Supabase verification save failed: ${error.message}`);
  }

  async getContactVerification(contact: string): Promise<ContactVerificationRecord | undefined> {
    const { data, error } = await this.db
      .from('leish_contact_verifications')
      .select('code_hash, attempts, expires_at')
      .eq('contact_key', contactKey(contact))
      .maybeSingle();
    if (error) throw new Error(`Supabase verification read failed: ${error.message}`);
    if (!data) return undefined;
    const row = data as { code_hash: string; attempts: number; expires_at: string };
    return {
      contact: contact.trim().toLowerCase(),
      codeHash: row.code_hash,
      attempts: row.attempts,
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  }

  async verifyAndConsumeContact(
    contact: string,
    code: string,
  ): Promise<'ok' | 'invalid' | 'expired' | 'locked'> {
    const record = await this.getContactVerification(contact);
    const result = classifyAttempt(record, contact, code);
    if (result.consume && record) {
      // Delete-with-select is the atomic single-use claim: only the request
      // whose delete returns the row consumed the code.
      const { data: deleted, error } = await this.db
        .from('leish_contact_verifications')
        .delete()
        .eq('contact_key', contactKey(contact))
        .select('contact_key');
      if (error) throw new Error(`Supabase verification consume failed: ${error.message}`);
      if (!deleted || deleted.length === 0) return 'invalid';
      return result.outcome;
    }
    if (record && result.nextAttempts !== undefined) {
      const { error } = await this.db
        .from('leish_contact_verifications')
        .update({ attempts: result.nextAttempts })
        .eq('contact_key', contactKey(contact));
      if (error) throw new Error(`Supabase verification update failed: ${error.message}`);
    }
    return result.outcome;
  }

  async updateBookingStatus(id: string, status: Booking['status']): Promise<Booking> {
    const current = await this.getBooking(id);
    if (!current) throw new Error('Booking not found');
    const booking = { ...current, status };
    const { error } = await this.db.from('leish_bookings').update({ data: booking }).eq('id', id);
    if (error) throw new Error(`Supabase booking update failed: ${error.message}`);
    return booking;
  }

  async getSalonReviews(salonId: string): Promise<Review[]> {
    const docs = await this.rows<Review>('leish_reviews', { column: 'salon_id', value: salonId });
    return docs.sort((a, b) => b.date.localeCompare(a.date));
  }

  async listSalonReviews(salonId: string, params: PageParams): Promise<Paginated<Review>> {
    const { data, error, count } = await this.db
      .from('leish_reviews')
      .select('data', { count: 'exact' })
      .eq('salon_id', salonId)
      .order('date', { ascending: false })
      .range(pageOffset(params), pageOffset(params) + params.limit - 1);
    if (error) throw new Error(`Supabase reviews page failed: ${error.message}`);
    return paginate((data ?? []).map(row => (row as { data: Review }).data), count ?? 0, params);
  }

  async createReview(review: Review): Promise<Review> {
    const existing = await this.rowById<Review>('leish_reviews', review.id);
    if (existing) throw new Error('Review already exists');
    const claimKey = review.reviewerId && review.bookingId ? reviewClaimKey(review.reviewerId, review.bookingId) : null;
    if (claimKey) {
      const { data: claim, error: claimError } = await this.db
        .from('leish_review_claims')
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
    const { error } = await this.db.from('leish_reviews').insert({
      id: review.id,
      salon_id: review.salonId,
      date: review.date,
      data: review,
    });
    if (error) {
      if (isUniqueViolation(error)) throw new Error('Review already exists');
      throw new Error(`Supabase review create failed: ${error.message}`);
    }
    if (claimKey) {
      const { error: claimInsertError } = await this.db.from('leish_review_claims').insert({
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
    return this.rows<StoredUser>('leish_users');
  }

  async listUsers(params: PageParams): Promise<Paginated<StoredUser>> {
    const { data, error, count } = await this.db
      .from('leish_users')
      .select('data', { count: 'exact' })
      .order('id', { ascending: true })
      .range(pageOffset(params), pageOffset(params) + params.limit - 1);
    if (error) throw new Error(`Supabase users page failed: ${error.message}`);
    return paginate((data ?? []).map(row => (row as { data: StoredUser }).data), count ?? 0, params);
  }

  async getUserById(id: string): Promise<StoredUser | undefined> {
    return this.rowById<StoredUser>('leish_users', id);
  }

  async getUserByEmail(email: string): Promise<StoredUser | undefined> {
    const normalized = normalizeEmail(email);
    const { data: claim, error: claimError } = await this.db
      .from('leish_user_emails')
      .select('user_id')
      .eq('email_key', emailKey(normalized))
      .maybeSingle();
    if (claimError) throw new Error(`Supabase email claim read failed: ${claimError.message}`);
    let user: StoredUser | undefined;
    if (claim) {
      user = await this.getUserById((claim as { user_id: string }).user_id);
    } else {
      const { data, error } = await this.db
        .from('leish_users')
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
      .from('leish_user_emails')
      .select('user_id')
      .eq('email_key', emailKey(normalized))
      .maybeSingle();
    if (claimError) throw new Error(`Supabase email claim read failed: ${claimError.message}`);
    if (claim) throw new Error('Email already registered');
    if (await this.getUserById(user.id)) throw new Error('User already exists');
    const { data: emailMatch, error: emailMatchError } = await this.db
      .from('leish_users')
      .select('id')
      .ilike('email', normalized)
      .limit(1);
    if (emailMatchError) throw new Error(`Supabase user lookup failed: ${emailMatchError.message}`);
    if (emailMatch && emailMatch.length > 0) throw new Error('Email already registered');
    const { error: userError } = await this.db.from('leish_users').insert({
      id: user.id,
      email: normalized,
      data: record,
    });
    if (userError) {
      if (isUniqueViolation(userError)) throw new Error('Email already registered');
      throw new Error(`Supabase user create failed: ${userError.message}`);
    }
    const { error: claimInsertError } = await this.db
      .from('leish_user_emails')
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
        .from('leish_user_emails')
        .select('user_id')
        .eq('email_key', emailKey(nextEmail))
        .maybeSingle();
      if (claimError) throw new Error(`Supabase email claim read failed: ${claimError.message}`);
      if (claim) throw new Error('Email already registered');
      const { data: emailMatch, error: emailMatchError } = await this.db
        .from('leish_users')
        .select('id')
        .ilike('email', nextEmail)
        .limit(2);
      if (emailMatchError) throw new Error(`Supabase user lookup failed: ${emailMatchError.message}`);
      if ((emailMatch ?? []).some(row => (row as { id: string }).id !== id)) {
        throw new Error('Email already registered');
      }
      const { error: deleteError } = await this.db.from('leish_user_emails').delete().eq('email_key', emailKey(oldEmail));
      if (deleteError) throw new Error(`Supabase email claim delete failed: ${deleteError.message}`);
      const { error: claimInsertError } = await this.db
        .from('leish_user_emails')
        .insert({ email_key: emailKey(nextEmail), user_id: id });
      if (claimInsertError) {
        if (isUniqueViolation(claimInsertError)) throw new Error('Email already registered');
        throw new Error(`Supabase email claim create failed: ${claimInsertError.message}`);
      }
    }
    const record = { ...original, ...patch, email: nextEmail, id };
    const { error } = await this.db.from('leish_users').update({ email: nextEmail, data: record }).eq('id', id);
    if (error) {
      if (isUniqueViolation(error)) throw new Error('Email already registered');
      throw new Error(`Supabase user update failed: ${error.message}`);
    }
    return record;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.getUserById(id);
    if (!user) throw new Error('User not found');
    const { error: claimError } = await this.db.from('leish_user_emails').delete().eq('user_id', id);
    if (claimError) throw new Error(`Supabase email claim delete failed: ${claimError.message}`);
    const { error } = await this.db.from('leish_users').delete().eq('id', id);
    if (error) throw new Error(`Supabase user delete failed: ${error.message}`);
  }
}

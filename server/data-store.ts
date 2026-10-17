import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import type { Salon, Booking, Review, Service, StaffMember, User } from '../src/types.ts';
import { FirestoreStore } from './firestore-store.ts';
import { SupabaseStore } from './supabase-store.ts';
import type { PageParams, Paginated } from './pagination.ts';
import { slicePage } from './pagination.ts';
import { bookingsConflict } from './slots.ts';
import type { ContactVerificationRecord } from './contact-verification.ts';
import { classifyAttempt, contactKey } from './contact-verification.ts';

export interface StoredUser extends User {
  password: string;
}

/** Raised when a booking would overlap an active booking for the same staff member (FR-004). */
export class SlotConflictError extends Error {
  constructor() {
    super('Slot conflict');
    this.name = 'SlotConflictError';
  }
}

export interface IdempotencyInput {
  /** Client-supplied `Idempotency-Key` header or server payload hash (G3). */
  key: string;
  /** Owner partition: `user:{id}` or `guest:{normalizedContact}` (BR-3). */
  scope: string;
}

export interface BookingWriteResult {
  booking: Booking;
  /** True when the idempotency key matched an existing booking (AC-007). */
  replayed: boolean;
}

/** Idempotency records live 24h (G3) and are scoped per owner (BR-3). */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export function idempotencyExpiry(now = Date.now()): string {
  return new Date(now + IDEMPOTENCY_TTL_MS).toISOString();
}

export function isIdempotencyLive(expiresAt: string, now = Date.now()): boolean {
  return new Date(expiresAt).getTime() > now;
}

/** Role-derived row filters for booking lists (computed by the handler, enforced by the store). */
export interface BookingListFilter {
  email?: string;
  salonId?: string;
}

/**
 * Server-side persistence contract.
 *
 * Keeping the API independent from the JSON implementation means the route
 * layer can use the synchronous JSON backend or the asynchronous Firestore
 * backend without changing authorization or business logic.
 */
export interface DataStore {
  save(): void | Promise<void>;
  getSalons(): Salon[] | Promise<Salon[]>;
  getSalon(id: string): Salon | undefined | Promise<Salon | undefined>;
  createSalon(salon: Salon): Salon | Promise<Salon>;
  updateSalon(id: string, updates: Partial<Salon>): Salon | Promise<Salon>;
  getBookings(): Booking[] | Promise<Booking[]>;
  getBooking(id: string): Booking | undefined | Promise<Booking | undefined>;
  createBooking(booking: Booking): Booking | Promise<Booking>;
  updateBookingStatus(id: string, status: Booking['status']): Booking | Promise<Booking>;
  getSalonReviews(salonId: string): Review[] | Promise<Review[]>;
  createReview(review: Review): Review | Promise<Review>;
  getUsers(): StoredUser[] | Promise<StoredUser[]>;
  getUserById(id: string): StoredUser | undefined | Promise<StoredUser | undefined>;
  getUserByEmail(email: string): StoredUser | undefined | Promise<StoredUser | undefined>;
  createUser(user: StoredUser): StoredUser | Promise<StoredUser>;
  updateUser(id: string, updates: Partial<StoredUser>): StoredUser | Promise<StoredUser>;
  deleteUser(id: string): void | Promise<void>;
  /**
   * Admin-only: remove a salon and all its services.
   */
  deleteSalon(id: string): void | Promise<void>;
  /**
   * Admin-only: remove a review.
   */
  deleteReview(id: string): void | Promise<void>;
  /**
   * Admin-only: remove a booking.
   */
  deleteBooking(id: string): void | Promise<void>;
  /**
   * Admin-only: list all reviews across all salons, paginated.
   */
  listAllReviews(params: PageParams): Paginated<Review> | Promise<Paginated<Review>>;
  /**
   * Bounded, ordered page reads (FR-006). Ordering is store-consistent:
   * salons/users by id asc; bookings by createdAt desc; reviews by date desc.
   * `listBookings` applies the handler-computed role filter at the store
   * level so durable backends never fetch full collections (FR-007).
   */
  listSalons(params: PageParams): Paginated<Salon> | Promise<Paginated<Salon>>;
  listBookings(params: PageParams, filter?: BookingListFilter): Paginated<Booking> | Promise<Paginated<Booking>>;
  listSalonReviews(salonId: string, params: PageParams): Paginated<Review> | Promise<Paginated<Review>>;
  listUsers(params: PageParams): Paginated<StoredUser> | Promise<Paginated<StoredUser>>;
  /**
   * Conflict-checked, idempotent booking create (FR-004/FR-005). Throws
   * `SlotConflictError` when an active (non-cancelled) booking for the same
   * salon+staff+date overlaps the requested window. A live idempotency
   * match returns the original booking with `replayed: true` instead of
   * creating a duplicate. The check+insert sequence is atomic per store.
   */
  createBookingIdempotent(booking: Booking, idempotency: IdempotencyInput): BookingWriteResult | Promise<BookingWriteResult>;
  /**
   * Guest email OTP persistence (FR-001). Records are keyed by normalized
   * contact; `verifyAndConsumeContact` classifies the attempt atomically:
   * success consumes the record (single-use), the final allowed failure
   * invalidates it (AC-015), expiry/lockout return their outcomes.
   */
  saveContactVerification(record: ContactVerificationRecord): void | Promise<void>;
  getContactVerification(contact: string): ContactVerificationRecord | undefined | Promise<ContactVerificationRecord | undefined>;
  verifyAndConsumeContact(
    contact: string,
    code: string,
  ): 'ok' | 'invalid' | 'expired' | 'locked' | Promise<'ok' | 'invalid' | 'expired' | 'locked'>;
}

// On Vercel the root filesystem is read-only; /tmp is the only writable path.
// LEISH_DB_PATH lets tests point at an isolated store without touching real data.
const STORE_PATH = process.env.LEISH_DB_PATH
  ? path.resolve(process.env.LEISH_DB_PATH)
  : process.env.VERCEL
  ? path.join('/tmp', 'db_store.json')
  : path.join(process.cwd(), 'db_store.json');

/**
 * Resolve the persistence backend before constructing any store. JSON is a
 * useful local/test fallback, but it cannot provide production durability.
 * Refusing to boot is safer than serving an empty catalog or writing to an
 * ephemeral deployment filesystem.
 */
export function getStoreBackend(
  environment = process.env.NODE_ENV,
  configuredBackend = process.env.STORE_BACKEND,
): 'json' | 'firestore' | 'supabase' {
  const backend = configuredBackend?.trim();
  const isProduction = environment === 'production' || process.env.VERCEL === '1';

  if (isProduction && backend !== 'firestore' && backend !== 'supabase') {
    // Explicit staging/demo escape hatch: serve the seeded JSON catalog
    // ephemerally instead of refusing to boot. Writes evaporate with the
    // serverless container, so this must never back real user data — it
    // exists so staging can be browsed before Firestore credentials land.
    if (process.env.LEISH_ALLOW_EPHEMERAL_DEMO === '1') {
      console.warn(
        '[leish] WARNING: serving the EPHEMERAL seed catalog ' +
          '(LEISH_ALLOW_EPHEMERAL_DEMO=1). Bookings and edits will evaporate. ' +
          'Configure STORE_BACKEND=firestore with credentials for real data.',
      );
      return 'json';
    }
    throw new Error(
      '[leish] Production requires a durable backend (STORE_BACKEND=firestore or supabase). The JSON backend is supported only for local development and tests. ' +
        'Set LEISH_ALLOW_EPHEMERAL_DEMO=1 to serve seed demo data instead (staging only, writes evaporate).',
    );
  }

  const selected = backend || 'json';
  if (selected !== 'json' && selected !== 'firestore' && selected !== 'supabase') {
    throw new Error(`Unknown STORE_BACKEND: ${selected}`);
  }
  return selected;
}

const hashPassword = (password: string): string => bcrypt.hashSync(password, 10);

// The catalog launches empty (Malaysia-only listings to be added through
// admin tooling). The sole seed is the administrator bootstrap account;
// it cannot be created via signup (register only allows client/provider).
// Set LEISH_ADMIN_PASSWORD in production — the fallback below exists only
// so local dev and tests boot without secrets. Existing db_store.json
// files keep their stored hash; this only affects fresh seeds.
const SEED_ADMIN_PASSWORD = process.env.LEISH_ADMIN_PASSWORD || 'lindan95';
const INITIAL_USERS: StoredUser[] = [
  {
    id: 'user-admin-1',
    name: 'Shamel',
    email: 'shamel@leish.my',
    password: hashPassword(SEED_ADMIN_PASSWORD),
    role: 'admin',
    phone: '+60 12-000 0000',
    bio: 'Marketplace administrator.',
    createdAt: '2026-10-17T00:00:00.000Z'
  }
];

// Curated Seed Data Exclusively for MVP Makeup Studios
// Intentionally empty: the marketplace launches without seed data (Malaysia-only catalog to be listed through admin tooling).
const INITIAL_SALONS: Salon[] = [];

// Intentionally empty: the marketplace launches without seed data (Malaysia-only catalog to be listed through admin tooling).
const INITIAL_REVIEWS: Review[] = [];

// Intentionally empty: the marketplace launches without seed data (Malaysia-only catalog to be listed through admin tooling).
const INITIAL_BOOKINGS: Booking[] = [];

export interface IdempotencyRecord {
  /** `scope:key` — unique per owner partition (BR-3). */
  compositeKey: string;
  bookingId: string;
  expiresAt: string;
}

/** Guest email OTP record (FR-001); see server/contact-verification.ts. */
export type { ContactVerificationRecord } from './contact-verification.ts';

export class JsonDataStore implements DataStore {
  private salons: Salon[] = [];
  private bookings: Booking[] = [];
  private reviews: Review[] = [];
  private users: StoredUser[] = [];
  private idempotencyKeys: IdempotencyRecord[] = [];
  private contactVerifications: ContactVerificationRecord[] = [];

  constructor() {
    this.load();
    this.normalizePasswords();
  }

  /**
   * Stores persisted before bcrypt was introduced hold PLAINTEXT passwords.
   * bcrypt.compareSync() always rejects those, so every login 401s and the
   * data file silently stays broken. Re-hash legacy values once on load.
   */
  private normalizePasswords(): void {
    const looksHashed = (p: string) => /^\$2[aby]\$\d{2}\$/.test(p || '');
    const legacy = this.users.filter(u => !looksHashed(u.password));
    if (legacy.length === 0) return;

    for (const user of legacy) {
      user.password = hashPassword(user.password);
    }
    this.save();
    console.warn(`[DataStore] Re-hashed ${legacy.length} legacy plaintext password(s).`);
  }

  private load() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const data = JSON.parse(raw);
        
        // Ensure MVP only contains makeup studios. If old data contains hair/nails, re-seed to makeup studios.
        const hasLegacyCategories = data.salons && data.salons.some((s: Salon) => s.category === 'hair' || s.category === 'nails' || s.category === 'massage');
        if (hasLegacyCategories || !data.salons || data.salons.length === 0) {
          this.salons = INITIAL_SALONS;
          this.reviews = INITIAL_REVIEWS;
          this.bookings = INITIAL_BOOKINGS;
          this.users = INITIAL_USERS;
          this.save();
        } else {
          this.salons = data.salons;
          this.bookings = data.bookings || [];
          this.reviews = data.reviews || [];
          this.users = (data.users && data.users.length > 0) ? data.users : INITIAL_USERS;
          this.idempotencyKeys = Array.isArray(data.idempotencyKeys) ? data.idempotencyKeys : [];
          this.contactVerifications = Array.isArray(data.contactVerifications) ? data.contactVerifications : [];
        }
      } else {
        this.salons = INITIAL_SALONS;
        this.reviews = INITIAL_REVIEWS;
        this.bookings = INITIAL_BOOKINGS;
        this.users = INITIAL_USERS;
        this.save();
      }
    } catch (e) {
      console.error('[DataStore] Error loading database store, falling back to in-memory seed.', e);
      this.salons = INITIAL_SALONS;
      this.reviews = INITIAL_REVIEWS;
      this.bookings = INITIAL_BOOKINGS;
      this.users = INITIAL_USERS;
    }
  }

  public save(): void {
    // Simple file lock to prevent concurrent writes from corrupting the store
    const lockPath = `${STORE_PATH}.lock`;
    const maxRetries = 50;
    const retryDelayMs = 20;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Try to create lock file exclusively (fails if exists)
        fs.openSync(lockPath, 'wx');
        break; // Lock acquired
      } catch (e: any) {
        if (e.code !== 'EEXIST') throw e;
        if (attempt === maxRetries - 1) throw new Error('Could not acquire store lock');
        // Wait and retry
        const start = Date.now();
        while (Date.now() - start < retryDelayMs) { /* busy wait for short delay */ }
      }
    }
    
    try {
      const data = {
        salons: this.salons,
        bookings: this.bookings,
        reviews: this.reviews,
        users: this.users,
        idempotencyKeys: this.idempotencyKeys,
        contactVerifications: this.contactVerifications
      };
      // Replace the file atomically so a process or filesystem interruption
      // cannot leave a truncated JSON store that loses the whole catalog.
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      const tempPath = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
      fs.renameSync(tempPath, STORE_PATH);
      // Existing stores may have been created with broader permissions.
      // Password hashes are still sensitive, so tighten them on every save.
      fs.chmodSync(STORE_PATH, 0o600);
    } finally {
      // Release lock
      try { fs.unlinkSync(lockPath); } catch {}
    }
  }

  // --- Salons ---
  public getSalons(): Salon[] {
    return this.salons;
  }

  public listSalons(params: PageParams): Paginated<Salon> {
    const ordered = [...this.salons].sort((a, b) => a.id.localeCompare(b.id));
    return slicePage(ordered, params);
  }

  public getSalon(id: string): Salon | undefined {
    return this.salons.find(s => s.id === id);
  }

  public createSalon(salon: Salon): Salon {
    if (this.salons.some(s => s.id === salon.id)) throw new Error('Salon already exists');
    this.salons.unshift(salon);
    this.save();
    return salon;
  }

  public updateSalon(id: string, updates: Partial<Salon>): Salon {
    const idx = this.salons.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Makeup Studio not found');
    this.salons[idx] = { ...this.salons[idx], ...updates };
    this.save();
    return this.salons[idx];
  }

  // --- Bookings ---
  public getBookings(): Booking[] {
    return this.bookings;
  }

  public listBookings(params: PageParams, filter: BookingListFilter = {}): Paginated<Booking> {
    const email = filter.email?.toLowerCase();
    const ordered = this.bookings
      .filter(b =>
        (!email || b.clientEmail.toLowerCase() === email) &&
        (!filter.salonId || b.salonId === filter.salonId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return slicePage(ordered, params);
  }

  public getBooking(id: string): Booking | undefined {
    return this.bookings.find(b => b.id === id);
  }

  public createBooking(booking: Booking): Booking {
    this.bookings.unshift(booking);
    this.save();
    return booking;
  }

  public createBookingIdempotent(booking: Booking, idempotency: IdempotencyInput): BookingWriteResult {
    // Synchronous check-then-insert: no await between them, so the Node
    // event loop serializes concurrent creates — the JSON backend is
    // single-process by contract (production uses durable backends).
    this.idempotencyKeys = this.idempotencyKeys.filter(entry => isIdempotencyLive(entry.expiresAt));
    const composite = `${idempotency.scope}:${idempotency.key}`;
    const existing = this.idempotencyKeys.find(entry => entry.compositeKey === composite);
    if (existing) {
      const original = this.getBooking(existing.bookingId);
      if (original) return { booking: original, replayed: true };
      this.idempotencyKeys = this.idempotencyKeys.filter(entry => entry !== existing);
    }
    const conflict = this.bookings.some(active =>
      active.salonId === booking.salonId &&
      active.staffId === booking.staffId &&
      active.status !== 'cancelled' &&
      bookingsConflict(active, booking),
    );
    if (conflict) throw new SlotConflictError();
    this.bookings.unshift(booking);
    this.idempotencyKeys.unshift({
      compositeKey: composite,
      bookingId: booking.id,
      expiresAt: idempotencyExpiry(),
    });
    this.save();
    return { booking, replayed: false };
  }

  public saveContactVerification(record: ContactVerificationRecord): void {
    this.contactVerifications = this.contactVerifications.filter(r => r.contact !== record.contact);
    this.contactVerifications.unshift(record);
    this.save();
  }

  public getContactVerification(contact: string): ContactVerificationRecord | undefined {
    const key = contactKey(contact);
    return this.contactVerifications.find(r => contactKey(r.contact) === key);
  }

  public verifyAndConsumeContact(
    contact: string,
    code: string,
  ): 'ok' | 'invalid' | 'expired' | 'locked' {
    const key = contactKey(contact);
    const record = this.contactVerifications.find(r => contactKey(r.contact) === key);
    const result = classifyAttempt(record, contact, code);
    if (record && result.consume) {
      this.contactVerifications = this.contactVerifications.filter(r => r !== record);
    } else if (record && result.nextAttempts !== undefined) {
      record.attempts = result.nextAttempts;
    }
    if (record && (result.consume || result.nextAttempts !== undefined)) this.save();
    return result.outcome;
  }

  public updateBookingStatus(id: string, status: Booking['status']): Booking {
    const idx = this.bookings.findIndex(b => b.id === id);
    if (idx === -1) throw new Error('Booking not found');
    this.bookings[idx].status = status;
    this.save();
    return this.bookings[idx];
  }

  // --- Reviews ---
  public getSalonReviews(salonId: string): Review[] {
    return this.reviews.filter(r => r.salonId === salonId);
  }

  public listSalonReviews(salonId: string, params: PageParams): Paginated<Review> {
    const ordered = this.reviews
      .filter(r => r.salonId === salonId)
      .sort((a, b) => b.date.localeCompare(a.date));
    return slicePage(ordered, params);
  }

  public createReview(review: Review): Review {
    if (review.reviewerId && review.bookingId && this.reviews.some(existing =>
      existing.reviewerId === review.reviewerId && existing.bookingId === review.bookingId
    )) {
      throw new Error('Review already exists for this booking and reviewer');
    }
    this.reviews.unshift(review);
    // Recalculate average studio rating
    const studioReviews = this.getSalonReviews(review.salonId);
    const avg = studioReviews.reduce((sum, r) => sum + r.rating, 0) / studioReviews.length;
    const studio = this.getSalon(review.salonId);
    if (studio) {
      studio.rating = Number(avg.toFixed(1));
      studio.reviewCount = studioReviews.length;
    }
    this.save();
    return review;
  }

  // --- Users & Authentication ---
  public getUsers(): StoredUser[] {
    return this.users;
  }

  public listUsers(params: PageParams): Paginated<StoredUser> {
    const ordered = [...this.users].sort((a, b) => a.id.localeCompare(b.id));
    return slicePage(ordered, params);
  }

  public getUserById(id: string): StoredUser | undefined {
    return this.users.find(u => u.id === id);
  }

  public getUserByEmail(email: string): StoredUser | undefined {
    const normalized = email.trim().toLowerCase();
    return this.users.find(u => u.email.toLowerCase() === normalized);
  }

  public createUser(user: StoredUser): StoredUser {
    user.password = bcrypt.hashSync(user.password, 10);
    this.users.unshift(user);
    this.save();
    return user;
  }

  public updateUser(id: string, updates: Partial<StoredUser>): StoredUser {
    const idx = this.users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error('User not found');
    if (updates.password) {
      updates.password = bcrypt.hashSync(updates.password, 10);
    }
    this.users[idx] = { ...this.users[idx], ...updates };
    this.save();
    return this.users[idx];
  }

  public deleteUser(id: string): void {
    const idx = this.users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error('User not found');
    this.users.splice(idx, 1);
    this.save();
  }

  public deleteSalon(id: string): void {
    const idx = this.salons.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Salon not found');
    this.salons.splice(idx, 1);
    this.save();
  }

  public deleteReview(id: string): void {
    const idx = this.reviews.findIndex(r => r.id === id);
    if (idx === -1) throw new Error('Review not found');
    this.reviews.splice(idx, 1);
    this.save();
  }

  public deleteBooking(id: string): void {
    const idx = this.bookings.findIndex(b => b.id === id);
    if (idx === -1) throw new Error('Booking not found');
    this.bookings.splice(idx, 1);
    this.save();
  }

  public listAllReviews(params: PageParams): Paginated<Review> {
    const ordered = [...this.reviews].sort((a, b) => b.date.localeCompare(a.date));
    return slicePage(ordered, params);
  }
}

const backend = getStoreBackend();
export const store: DataStore =
  backend === 'firestore' ? new FirestoreStore() : backend === 'supabase' ? new SupabaseStore() : new JsonDataStore();

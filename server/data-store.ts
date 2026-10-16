import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import type { Salon, Booking, Review, Service, StaffMember, User } from '../src/types.ts';
import { FirestoreStore } from './firestore-store.ts';
import { SupabaseStore } from './supabase-store.ts';

export interface StoredUser extends User {
  password: string;
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
const INITIAL_USERS: StoredUser[] = [
  {
    id: 'user-admin-1',
    name: 'Shamel',
    email: 'shamel@leish.my',
    password: hashPassword('lindan95'),
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

export class JsonDataStore implements DataStore {
  private salons: Salon[] = [];
  private bookings: Booking[] = [];
  private reviews: Review[] = [];
  private users: StoredUser[] = [];

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
    console.log(`[DataStore] Re-hashed ${legacy.length} legacy plaintext password(s).`);
  }

  private load() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const data = JSON.parse(raw);
        
        // Ensure MVP only contains makeup studios. If old data contains hair/nails, re-seed to makeup studios.
        const hasLegacyCategories = data.salons && data.salons.some((s: Salon) => s.category === 'hair' || s.category === 'nails' || s.category === 'massage');
        if (hasLegacyCategories || !data.salons || data.salons.length === 0) {
          console.log('[DataStore] Migrating data store to MVP Makeup Studios...');
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
        }
        console.log(`[DataStore] Loaded ${this.salons.length} makeup studios, ${this.bookings.length} bookings, ${this.reviews.length} reviews, ${this.users.length} users.`);
      } else {
        this.salons = INITIAL_SALONS;
        this.reviews = INITIAL_REVIEWS;
        this.bookings = INITIAL_BOOKINGS;
        this.users = INITIAL_USERS;
        this.save();
        console.log('[DataStore] Initialized with makeup studio seed data and written to file.');
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
        users: this.users
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

  public getBooking(id: string): Booking | undefined {
    return this.bookings.find(b => b.id === id);
  }

  public createBooking(booking: Booking): Booking {
    this.bookings.unshift(booking);
    this.save();
    return booking;
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
}

const backend = getStoreBackend();
export const store: DataStore =
  backend === 'firestore' ? new FirestoreStore() : backend === 'supabase' ? new SupabaseStore() : new JsonDataStore();

import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { Firestore } from 'firebase-admin/firestore';
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
import { bookingsConflict } from './slots.ts';

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const emailKey = (email: string) => createHash('sha256').update(normalizeEmail(email)).digest('hex');
const reviewClaimKey = (reviewerId: string, bookingId: string) =>
  createHash('sha256').update(`${reviewerId}:${bookingId}`).digest('hex');
const configuredDatabases = new WeakSet<Firestore>();

// Admin uses ADC (including GOOGLE_APPLICATION_CREDENTIALS); never ship a
// service-account key to the browser. The emulator needs an explicit project
// so it cannot accidentally operate under an inferred production project.
async function connect(): Promise<Firestore> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (process.env.FIRESTORE_EMULATOR_HOST && !projectId) {
    throw new Error('FIREBASE_PROJECT_ID is required with FIRESTORE_EMULATOR_HOST');
  }
  const [{ applicationDefault, cert, getApps, initializeApp }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/firestore'),
  ]);
  const name = 'leish-firestore-store';
  const credential = process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
    ? cert({
        projectId: projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      })
    : process.env.FIRESTORE_EMULATOR_HOST
    ? undefined
    : applicationDefault();
  const app = getApps().find(existing => existing.name === name) ?? initializeApp({
    ...(credential ? { credential } : {}),
    ...(projectId ? { projectId } : {}),
  }, name);
  const db = getFirestore(app);
  // JSON-backed development data contains optional fields as `undefined`.
  // Firestore rejects those values by default, while omitting them is the
  // intended representation for optional booking/profile fields.
  // getFirestore returns the same instance for the named Admin app. Settings
  // cannot be applied again after the first store has used that instance.
  if (!configuredDatabases.has(db)) {
    db.settings({ ignoreUndefinedProperties: true });
    configuredDatabases.add(db);
  }
  return db;
}

/** One Firestore document per entity. Reads never use a process-wide data cache. */
export class FirestoreStore implements DataStore {
  private readonly dbPromise: Promise<Firestore>;

  constructor(db?: Firestore) {
    this.dbPromise = db ? Promise.resolve(db) : connect();
    // In particular, don't eagerly load or seed the JSON store here.
  }

  // Each mutation already waits for its Firestore commit; there is no buffered state.
  async save(): Promise<void> { await this.dbPromise; }

  async getSalons(): Promise<Salon[]> {
    const db = await this.dbPromise;
    return (await db.collection('salons').get()).docs.map(doc => doc.data() as Salon);
  }

  async listSalons(params: PageParams): Promise<Paginated<Salon>> {
    const db = await this.dbPromise;
    // Document-ID order is chronological for app-generated `salon-<ms>-*` ids
    // and, unlike `name`, is unique — required for stable pagination.
    const collection = db.collection('salons');
    const [total, page] = await Promise.all([
      collection.count().get().then(snap => snap.data().count),
      collection.orderBy('__name__').limit(params.limit).offset(pageOffset(params)).get(),
    ]);
    return paginate(page.docs.map(doc => doc.data() as Salon), total, params);
  }

  async getSalon(id: string): Promise<Salon | undefined> {
    const db = await this.dbPromise;
    const doc = await db.collection('salons').doc(id).get();
    return doc.exists ? doc.data() as Salon : undefined;
  }

  async createSalon(salon: Salon): Promise<Salon> {
    const db = await this.dbPromise;
    const ref = db.collection('salons').doc(salon.id);
    const existing = await ref.get();
    if (existing.exists) throw new Error('Salon already exists');
    await ref.create(salon);
    return salon;
  }

  async updateSalon(id: string, updates: Partial<Salon>): Promise<Salon> {
    const db = await this.dbPromise;
    const ref = db.collection('salons').doc(id);
    return db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new Error('Makeup Studio not found');
      const salon = { ...snapshot.data() as Salon, ...updates, id };
      tx.set(ref, salon);
      return salon;
    });
  }

  async getBookings(): Promise<Booking[]> {
    const db = await this.dbPromise;
    const docs = (await db.collection('bookings').get()).docs.map(doc => doc.data() as Booking);
    return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listBookings(params: PageParams, filter: BookingListFilter = {}): Promise<Paginated<Booking>> {
    const db = await this.dbPromise;
    // Emails are normalized to lowercase at creation (server.ts), so an
    // exact match is case-insensitive in practice.
    let filtered = db.collection('bookings') as FirebaseFirestore.Query;
    if (filter.salonId) filtered = filtered.where('salonId', '==', filter.salonId);
    if (filter.email) filtered = filtered.where('clientEmail', '==', filter.email.toLowerCase());
    const ordered = filtered.orderBy('createdAt', 'desc');
    const [total, page] = await Promise.all([
      filtered.count().get().then(snap => snap.data().count),
      ordered.limit(params.limit).offset(pageOffset(params)).get(),
    ]);
    return paginate(page.docs.map(doc => doc.data() as Booking), total, params);
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    const db = await this.dbPromise;
    const doc = await db.collection('bookings').doc(id).get();
    return doc.exists ? doc.data() as Booking : undefined;
  }

  async createBooking(booking: Booking): Promise<Booking> {
    const db = await this.dbPromise;
    await db.collection('bookings').doc(booking.id).create(booking);
    return booking;
  }

  async createBookingIdempotent(booking: Booking, idempotency: IdempotencyInput): Promise<BookingWriteResult> {
    const db = await this.dbPromise;
    // Hashing keeps doc ids within Firestore's 1500-byte/UTF-8-safe key rules
    // regardless of what a client sends in the header.
    const keyRef = db.collection('idempotencyKeys').doc(
      createHash('sha256').update(`${idempotency.scope}:${idempotency.key}`).digest('hex'),
    );
    return db.runTransaction(async tx => {
      // All reads precede all writes (Firestore transaction contract).
      // Concurrent same-key creates contend on keyRef: the loser aborts,
      // retries, then observes the winner's key and replays it.
      const keySnapshot = await tx.get(keyRef);
      if (keySnapshot.exists) {
        const record = keySnapshot.data() as { bookingId: string; expiresAt: string };
        if (isIdempotencyLive(record.expiresAt)) {
          const original = await tx.get(db.collection('bookings').doc(record.bookingId));
          if (original.exists) {
            return { booking: original.data() as Booking, replayed: true };
          }
        }
      }
      const candidates = await tx.get(
        db.collection('bookings')
          .where('salonId', '==', booking.salonId)
          .where('staffId', '==', booking.staffId)
          .where('date', '==', booking.date),
      );
      const conflict = candidates.docs
        .map(doc => doc.data() as Booking)
        .some(candidate => candidate.status !== 'cancelled' && bookingsConflict(candidate, booking));
      if (conflict) throw new SlotConflictError();
      tx.create(db.collection('bookings').doc(booking.id), booking);
      tx.set(keyRef, { bookingId: booking.id, expiresAt: idempotencyExpiry() });
      return { booking, replayed: false };
    });
  }

  async saveContactVerification(record: ContactVerificationRecord): Promise<void> {
    const db = await this.dbPromise;
    await db.collection('contactVerifications').doc(contactKey(record.contact)).set(record);
  }

  async getContactVerification(contact: string): Promise<ContactVerificationRecord | undefined> {
    const db = await this.dbPromise;
    const doc = await db.collection('contactVerifications').doc(contactKey(contact)).get();
    return doc.exists ? doc.data() as ContactVerificationRecord : undefined;
  }

  async verifyAndConsumeContact(
    contact: string,
    code: string,
  ): Promise<'ok' | 'invalid' | 'expired' | 'locked'> {
    const db = await this.dbPromise;
    const recordRef = db.collection('contactVerifications').doc(contactKey(contact));
    // Transaction makes the consume single-use: concurrent attempts with the
    // same code contend on the record; only one sees it.
    return db.runTransaction(async tx => {
      const snapshot = await tx.get(recordRef);
      const record = snapshot.exists ? snapshot.data() as ContactVerificationRecord : undefined;
      const result = classifyAttempt(record, contact, code);
      if (record && result.consume) {
        tx.delete(recordRef);
      } else if (record && result.nextAttempts !== undefined) {
        tx.set(recordRef, { ...record, attempts: result.nextAttempts });
      }
      return result.outcome;
    });
  }

  async updateBookingStatus(id: string, status: Booking['status']): Promise<Booking> {
    const db = await this.dbPromise;
    const ref = db.collection('bookings').doc(id);
    return db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new Error('Booking not found');
      const booking = { ...snapshot.data() as Booking, status };
      tx.set(ref, booking);
      return booking;
    });
  }

  async getSalonReviews(salonId: string): Promise<Review[]> {
    const db = await this.dbPromise;
    const snapshot = await db.collection('reviews').where('salonId', '==', salonId).get();
    return snapshot.docs.map(doc => doc.data() as Review).sort((a, b) => b.date.localeCompare(a.date));
  }

  async listSalonReviews(salonId: string, params: PageParams): Promise<Paginated<Review>> {
    const db = await this.dbPromise;
    // where + orderBy needs the composite index in firestore.indexes.json.
    const filtered = db.collection('reviews').where('salonId', '==', salonId);
    const ordered = filtered.orderBy('date', 'desc');
    const [total, page] = await Promise.all([
      filtered.count().get().then(snap => snap.data().count),
      ordered.limit(params.limit).offset(pageOffset(params)).get(),
    ]);
    return paginate(page.docs.map(doc => doc.data() as Review), total, params);
  }

  async createReview(review: Review): Promise<Review> {
    const db = await this.dbPromise;
    const ref = db.collection('reviews').doc(review.id);
    const salonRef = db.collection('salons').doc(review.salonId);
    const claimRef = review.reviewerId && review.bookingId
      ? db.collection('reviewClaims').doc(reviewClaimKey(review.reviewerId, review.bookingId))
      : undefined;
    return db.runTransaction(async tx => {
      // All reads precede all writes. Concurrent reviews contend on salonRef;
      // Firestore retries the loser with the newly committed review included.
      const salonSnapshot = await tx.get(salonRef);
      const existing = await tx.get(db.collection('reviews').where('salonId', '==', review.salonId));
      const duplicate = await tx.get(ref);
      const claim = claimRef ? await tx.get(claimRef) : undefined;
      if (duplicate.exists) throw new Error('Review already exists');
      if (claim?.exists) throw new Error('Review already exists for this booking and reviewer');
      if (review.reviewerId && review.bookingId && existing.docs.some(doc => {
        const existingReview = doc.data() as Review;
        return existingReview.reviewerId === review.reviewerId && existingReview.bookingId === review.bookingId;
      })) {
        throw new Error('Review already exists for this booking and reviewer');
      }
      if (claimRef) {
        tx.create(claimRef, {
          reviewerId: review.reviewerId,
          bookingId: review.bookingId,
          reviewId: review.id,
          salonId: review.salonId,
        });
      }
      tx.create(ref, review);
      if (salonSnapshot.exists) {
        const reviews = existing.docs.map(doc => doc.data() as Review);
        const count = reviews.length + 1;
        const rating = Number(((reviews.reduce((sum, item) => sum + item.rating, 0) + review.rating) / count).toFixed(1));
        tx.update(salonRef, { rating, reviewCount: count });
      }
      return review;
    });
  }

  async getUsers(): Promise<StoredUser[]> {
    const db = await this.dbPromise;
    return (await db.collection('users').get()).docs.map(doc => doc.data() as StoredUser);
  }

  async listUsers(params: PageParams): Promise<Paginated<StoredUser>> {
    const db = await this.dbPromise;
    // Document-ID order (app ids are `user-<ms>-*`, chronological); `email`
    // would also work but ids are guaranteed unique for stable pages.
    const collection = db.collection('users');
    const [total, page] = await Promise.all([
      collection.count().get().then(snap => snap.data().count),
      collection.orderBy('__name__').limit(params.limit).offset(pageOffset(params)).get(),
    ]);
    return paginate(page.docs.map(doc => doc.data() as StoredUser), total, params);
  }

  async getUserById(id: string): Promise<StoredUser | undefined> {
    const db = await this.dbPromise;
    const doc = await db.collection('users').doc(id).get();
    return doc.exists ? doc.data() as StoredUser : undefined;
  }

  async getUserByEmail(email: string): Promise<StoredUser | undefined> {
    const db = await this.dbPromise;
    const normalized = normalizeEmail(email);
    const claim = await db.collection('userEmails').doc(emailKey(normalized)).get();
    const user = claim.exists
      ? await this.getUserById((claim.data() as { userId: string }).userId)
      : ((await db.collection('users').where('email', '==', normalized).limit(1).get()).docs[0]?.data() as StoredUser | undefined);
    return user && normalizeEmail(user.email) === normalized ? user : undefined;
  }

  async createUser(user: StoredUser): Promise<StoredUser> {
    const db = await this.dbPromise;
    const normalized = normalizeEmail(user.email);
    const record = { ...user, email: normalized, password: await bcrypt.hash(user.password, 10) };
    const userRef = db.collection('users').doc(user.id);
    const claimRef = db.collection('userEmails').doc(emailKey(normalized));
    await db.runTransaction(async tx => {
      const [claim, existing, emailMatch] = await Promise.all([
        tx.get(claimRef),
        tx.get(userRef),
        tx.get(db.collection('users').where('email', '==', normalized).limit(1)),
      ]);
      if (claim.exists) throw new Error('Email already registered');
      if (existing.exists) throw new Error('User already exists');
      if (!emailMatch.empty) throw new Error('Email already registered');
      tx.create(claimRef, { userId: user.id });
      tx.create(userRef, record);
    });
    return record;
  }

  async updateUser(id: string, updates: Partial<StoredUser>): Promise<StoredUser> {
    const db = await this.dbPromise;
    const userRef = db.collection('users').doc(id);
    const patch = { ...updates };
    if (patch.password) patch.password = await bcrypt.hash(patch.password, 10);
    return db.runTransaction(async tx => {
      const snapshot = await tx.get(userRef);
      if (!snapshot.exists) throw new Error('User not found');
      const original = snapshot.data() as StoredUser;
      const oldEmail = normalizeEmail(original.email);
      const nextEmail = patch.email === undefined ? oldEmail : normalizeEmail(patch.email);
      const oldClaim = db.collection('userEmails').doc(emailKey(oldEmail));
      if (nextEmail !== oldEmail) {
        const newClaim = db.collection('userEmails').doc(emailKey(nextEmail));
        const [claim, emailMatch] = await Promise.all([
          tx.get(newClaim),
          tx.get(db.collection('users').where('email', '==', nextEmail).limit(2)),
        ]);
        if (claim.exists || emailMatch.docs.some(doc => doc.id !== id)) throw new Error('Email already registered');
        tx.delete(oldClaim);
        tx.create(newClaim, { userId: id });
      }
      const record = { ...original, ...patch, email: nextEmail, id };
      tx.set(userRef, record);
      return record;
    });
  }

  async deleteUser(id: string): Promise<void> {
    const db = await this.dbPromise;
    const userRef = db.collection('users').doc(id);
    await db.runTransaction(async tx => {
      const snapshot = await tx.get(userRef);
      if (!snapshot.exists) throw new Error('User not found');
      const user = snapshot.data() as StoredUser;
      tx.delete(userRef);
      tx.delete(db.collection('userEmails').doc(emailKey(normalizeEmail(user.email))));
    });
  }

  async deleteSalon(id: string): Promise<void> {
    const db = await this.dbPromise;
    const ref = db.collection('salons').doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error('Salon not found');
    await ref.delete();
  }

  async deleteReview(id: string): Promise<void> {
    const db = await this.dbPromise;
    const ref = db.collection('reviews').doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error('Review not found');
    await ref.delete();
  }

  async deleteBooking(id: string): Promise<void> {
    const db = await this.dbPromise;
    const ref = db.collection('bookings').doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error('Booking not found');
    await ref.delete();
  }

  async updateBookingPayment(
    id: string,
    updates: { paymentStatus: Booking['paymentStatus']; paymentMethod?: Booking['paymentMethod'] | null; paymentUrl?: Booking['paymentUrl'] | null; paymentPaidAt?: Booking['paymentPaidAt'] | null },
  ): Promise<void> {
    const db = await this.dbPromise;
    const ref = db.collection('bookings').doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error('Booking not found');
    await ref.update(updates);
  }

  async listAllReviews(params: PageParams): Promise<Paginated<Review>> {
    const db = await this.dbPromise;
    const collection = db.collection('reviews');
    const [total, page] = await Promise.all([
      collection.count().get().then(snap => snap.data().count),
      collection.orderBy('date', 'desc').limit(params.limit).offset(pageOffset(params)).get(),
    ]);
    return paginate(page.docs.map(doc => doc.data() as Review), total, params);
  }
}

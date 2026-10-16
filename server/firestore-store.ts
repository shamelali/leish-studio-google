import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { Firestore } from 'firebase-admin/firestore';
import type { Booking, Review, Salon } from '../src/types.ts';
import type { DataStore, StoredUser } from './data-store.ts';

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
}

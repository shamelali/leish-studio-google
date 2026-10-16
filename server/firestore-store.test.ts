import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { FirestoreStore } from './firestore-store.ts';
import type { Booking, Salon } from '../src/types.ts';

const emulatorEnabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_PROJECT_ID);

describe.skipIf(!emulatorEnabled)('FirestoreStore emulator integration', () => {
  it('omits undefined optional fields and persists bookings across store instances', async () => {
    const id = `test-booking-${randomUUID()}`;
    const store = new FirestoreStore();
    const booking: Booking = {
      id, salonId: 'test-salon', salonName: 'Test Salon', salonAddress: 'Test Street',
      serviceId: 'test-service', serviceName: 'Test Service', servicePrice: 120,
      serviceDuration: 60, staffId: 'test-staff', staffName: 'Test Artist',
      date: '2026-10-20', time: '10:30 AM', clientName: 'Test Client',
      clientEmail: 'booking@example.test', clientPhone: '', notes: undefined,
      eventVenue: undefined, travelSurcharge: undefined, attachedMoodboard: undefined,
      status: 'pending', createdAt: '2026-10-10T10:00:00.000Z',
    };
    const db = await (store as unknown as { dbPromise: Promise<import('firebase-admin/firestore').Firestore> }).dbPromise;
    try {
      await expect(store.createBooking(booking)).resolves.toMatchObject({ id, status: 'pending' });
      const reader = new FirestoreStore();
      const persisted = await reader.getBooking(id);
      expect(persisted).toMatchObject({ id, status: 'pending', clientEmail: booking.clientEmail });
      expect(persisted).not.toHaveProperty('notes');
      expect(persisted).not.toHaveProperty('eventVenue');
      expect(persisted).not.toHaveProperty('attachedMoodboard');
      expect((await reader.getBookings()).find(item => item.id === id)).toEqual(persisted);

      await expect(reader.createBooking(booking)).rejects.toThrow();
      expect(await store.updateBookingStatus(id, 'confirmed')).toMatchObject({ id, status: 'confirmed' });
      expect((await reader.getBooking(id))?.status).toBe('confirmed');
      await expect(reader.updateBookingStatus(`${id}-missing`, 'confirmed')).rejects.toThrow('Booking not found');
    } finally {
      await db.collection('bookings').doc(id).delete();
    }
  });

  it('round-trips users with normalized unique email claims', async () => {
    const store = new FirestoreStore();
    const id = `test-user-${Date.now()}`;
    const created = await store.createUser({
      id,
      name: 'Adapter Test',
      email: `  Firestore-${id}@Example.test `,
      password: 'adapter-secret',
      role: 'client',
      createdAt: new Date().toISOString(),
    });

    expect(created.email).toBe(`firestore-${id}@example.test`);
    expect((await store.getUserByEmail(`FIRESTORE-${id}@EXAMPLE.TEST`))?.id).toBe(id);
    await expect(store.createUser({ ...created, id: `${id}-duplicate`, password: 'other' }))
      .rejects.toThrow('Email already registered');
  });

  it('updates review aggregates transactionally', async () => {
    const store = new FirestoreStore();
    const salonId = `test-salon-${Date.now()}`;
    const salon: Salon = {
      id: salonId, name: 'Adapter Salon', tagline: '', description: '', rating: 0,
      reviewCount: 0, location: '', address: '', image: '', gallery: [], category: 'glam',
      services: [], staff: [], featured: false, workingHours: {},
    };
    // FirestoreStore's salon mutation intentionally requires an existing document.
    const dbStore = store as unknown as { dbPromise: Promise<any> };
    const db = await dbStore.dbPromise;
    await db.collection('salons').doc(salonId).set(salon);
    await Promise.all([
      store.createReview({ id: `${salonId}-a`, salonId, clientName: 'A', rating: 5, text: 'Great', date: '2026-01-01' }),
      store.createReview({ id: `${salonId}-b`, salonId, clientName: 'B', rating: 3, text: 'Good', date: '2026-01-02' }),
    ]);
    const result = await store.getSalon(salonId);
    expect(result?.reviewCount).toBe(2);
    expect(result?.rating).toBe(4);
  });

  it('creates salons and rejects duplicate ids', async () => {
    const store = new FirestoreStore();
    const id = `test-salon-${Date.now()}`;
    const salon = {
      id, name: 'Adapter Atelier', tagline: '', description: '', rating: 0,
      reviewCount: 0, location: 'KL', address: 'Test Street', image: '',
      gallery: [], category: 'bridal', services: [], staff: [],
      featured: false, workingHours: {},
    };
    const db = await (store as unknown as { dbPromise: Promise<import('firebase-admin/firestore').Firestore> }).dbPromise;
    try {
      await expect(store.createSalon(salon)).resolves.toMatchObject({ id });
      expect(await store.getSalon(id)).toMatchObject({ id, name: 'Adapter Atelier' });
      await expect(store.createSalon(salon)).rejects.toThrow('Salon already exists');
    } finally {
      await db.collection('salons').doc(id).delete();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SupabaseStore } from './supabase-store.ts';
import { SlotConflictError } from './data-store.ts';
import type { Booking } from '../src/types.ts';

// Live integration: runs only when Supabase credentials are present
// (local .env or CI secrets). Writes disposable rows and deletes them.
const supabaseEnabled = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!supabaseEnabled)('SupabaseStore live integration', () => {
  it('persists bookings across store instances', async () => {
    const id = `test-booking-${randomUUID()}`;
    const store = new SupabaseStore();
    const booking: Booking = {
      id, salonId: 'test-salon', salonName: 'Test Salon', salonAddress: 'Test Street',
      serviceId: 'test-service', serviceName: 'Test Service', servicePrice: 120,
      serviceDuration: 60, staffId: 'test-staff', staffName: 'Test Artist',
      date: '2026-10-20', time: '10:30 AM', clientName: 'Test Client',
      clientEmail: 'booking@example.test', clientPhone: '',
      status: 'pending', createdAt: '2026-10-10T10:00:00.000Z',
    };
    try {
      await expect(store.createBooking(booking)).resolves.toMatchObject({ id, status: 'pending' });
      const reader = new SupabaseStore();
      expect(await reader.getBooking(id)).toMatchObject({ id, status: 'pending' });
      expect(await store.updateBookingStatus(id, 'confirmed')).toMatchObject({ id, status: 'confirmed' });
      expect((await reader.getBooking(id))?.status).toBe('confirmed');
      await expect(reader.updateBookingStatus(`${id}-missing`, 'confirmed')).rejects.toThrow('Booking not found');
    } finally {
      await store['db'].from('leish_bookings').delete().eq('id', id);
    }
  });

  it('enforces slot exclusion and idempotent replay (AC-005/AC-007/AC-008 store level)', async () => {
    const store = new SupabaseStore();
    const run = Date.now();
    const slot = { salonId: `conflict-salon-${run}`, staffId: 'staff-x', date: '2026-11-10', time: '10:00 AM' };
    const make = (suffix: string): Booking => ({
      id: `book-${run}-${suffix}`,
      salonId: slot.salonId, salonName: 'S', salonAddress: 'A',
      serviceId: 'svc', serviceName: 'S', servicePrice: 10, serviceDuration: 60,
      staffId: slot.staffId, staffName: 'T', date: slot.date, time: slot.time,
      clientName: 'C', clientEmail: `${suffix}@example.test`, clientPhone: '',
      status: 'pending', createdAt: new Date().toISOString(),
    });
    const idem = { key: `k-${run}`, scope: 'guest:x@example.test' };
    const keyHash = (await import('node:crypto')).createHash('sha256').update(`${idem.scope}:${idem.key}`).digest('hex');
    try {
      const first = await store.createBookingIdempotent(make('aaaaaa'), idem);
      expect(first.replayed).toBe(false);
      const replay = await store.createBookingIdempotent(make('bbbbbb'), idem);
      expect(replay.replayed).toBe(true);
      expect(replay.booking.id).toBe(first.booking.id);
      await expect(
        store.createBookingIdempotent(make('cccccc'), { key: `k2-${run}`, scope: 'guest:y@example.test' }),
      ).rejects.toBeInstanceOf(SlotConflictError);
    } finally {
      await store['db'].from('leish_idempotency_keys').delete().eq('idem_key', keyHash);
      await store['db'].from('leish_bookings').delete().eq('salon_id', slot.salonId);
    }
  });

  it('round-trips users with normalized unique email claims', async () => {
    const id = `test-user-${Date.now()}`;
    const email = `User-${Date.now()}@Example.Test`;
    const store = new SupabaseStore();
    const created = await store.createUser({
      id, name: 'Test User', email, password: 'password123', role: 'client',
      createdAt: new Date().toISOString(),
    });
    try {
      expect(created.email).toBe(email.toLowerCase());
      expect(created.password).not.toBe('password123');
      expect(await store.getUserByEmail(email.toUpperCase())).toMatchObject({ id });
      await expect(store.createUser({ ...created, id: `${id}-dup`, password: 'password123' })).rejects.toThrow(
        'Email already registered',
      );
      const renamed = await store.updateUser(id, { name: 'Renamed' });
      expect(renamed.name).toBe('Renamed');
    } finally {
      await store['db'].from('leish_user_emails').delete().eq('user_id', id);
      await store['db'].from('leish_users').delete().eq('id', id);
    }
  });

  it('creates salons and rejects duplicate ids', async () => {
    const store = new SupabaseStore();
    const id = `test-salon-${Date.now()}`;
    const salon = {
      id, name: 'Adapter Atelier', tagline: '', description: '', rating: 0,
      reviewCount: 0, location: 'KL', address: 'Test Street', image: '',
      gallery: [], category: 'bridal', services: [], staff: [],
      featured: false, workingHours: {},
    };
    try {
      await expect(store.createSalon(salon)).resolves.toMatchObject({ id });
      expect(await store.getSalon(id)).toMatchObject({ id, name: 'Adapter Atelier' });
      await expect(store.createSalon(salon)).rejects.toThrow('Salon already exists');
    } finally {
      await store['db'].from('leish_salons').delete().eq('id', id);
    }
  });

  it('deletes users and frees their email claim', async () => {
    const store = new SupabaseStore();
    const id = `test-deluser-${Date.now()}`;
    const email = `deluser-${Date.now()}@example.test`;
    await store.createUser({
      id, name: 'Delete Me', email, password: 'secret', role: 'client',
      createdAt: new Date().toISOString(),
    });
    await store.deleteUser(id);
    expect(await store.getUserById(id)).toBeUndefined();
    expect(await store.getUserByEmail(email)).toBeUndefined();
    await expect(store.deleteUser(id)).rejects.toThrow('User not found');
  });
});

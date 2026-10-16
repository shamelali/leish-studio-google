/**
 * Phase 0 regression suite — booking funnel & auth'd writes.
 *
 * Guards against the four shipped defects:
 *   0.1 booking date regex corruption  (server.ts bookingSchema)
 *   0.3 markdown-fence stripping        (stripJsonFences)
 *   0.4 malformed ID template literals  (book-/user-/rev- ids)
 *   auth  401s on authenticated mutations (PATCH status)
 * Also covers booking ownership/status boundaries and validated booking/salon writes.
 *
 * Runs against an isolated temp store (LEISH_DB_PATH) so real dev data
 * in db_store.json is never touched.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import bcrypt from 'bcrypt';
import type { BookingStatus } from './src/types.ts';

const TEST_DB = `/tmp/omnirush/leish-server-test-${process.pid}-${Date.now()}.json`;

// Must be set before server.ts (and its DataStore singleton) is imported.
process.env.LEISH_DB_PATH = TEST_DB;
process.env.STORE_BACKEND = 'json';
process.env.LEISH_DISABLE_RATE_LIMIT = '1';
process.env.GEMINI_API_KEY = '';

let app: any;
let stripJsonFences: (text: string) => string;
let getJwtSecret: (environment?: string, configuredSecret?: string) => string;
let testStore: any;
let providerToken = '';
let bookingId = '';

beforeAll(async () => {
  // The product ships with an empty catalog (no seed data). Tests build
  // their own isolated fixture: two Malaysian ateliers plus one provider
  // per salon and one client, written before the server module loads.
  const fixtureSalons = JSON.parse(fs.readFileSync('server/test-fixture.json', 'utf-8')).salons;
  const hashPassword = (plain: string) => bcrypt.hashSync(plain, 10);
  fs.writeFileSync(TEST_DB, JSON.stringify({
    salons: fixtureSalons,
    bookings: [],
    reviews: [],
    users: [
      { id: 'user-provider-1', name: 'Aina Rahman', email: 'aina@leish.test', password: hashPassword('password123'), role: 'provider', salonId: 'salon-1', phone: '+60 12-890 1234', createdAt: '2026-01-10T10:00:00.000Z' },
      { id: 'user-provider-2', name: 'Siti Ahmad', email: 'siti@leish.test', password: hashPassword('password123'), role: 'provider', salonId: 'salon-2', phone: '+60 12-456 7890', createdAt: '2026-01-12T12:00:00.000Z' },
      { id: 'user-client-1', name: 'Mei Ling', email: 'mei@leish.test', password: hashPassword('password123'), role: 'client', phone: '+60 12-345 6789', createdAt: '2026-01-15T08:00:00.000Z' },
      { id: 'user-admin-1', name: 'Shamel', email: 'shamel@leish.my', password: hashPassword('lindan95'), role: 'admin', phone: '+60 12-000 0000', createdAt: '2026-10-17T00:00:00.000Z' },
    ],
  }));

  const mod = await import('./server.ts');
  app = mod.default;
  stripJsonFences = mod.stripJsonFences;
  getJwtSecret = mod.getJwtSecret;
  testStore = (await import('./server/data-store.ts')).store;

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'aina@leish.test', password: 'password123' });
  expect(login.status).toBe(200);
  providerToken = login.body.token;
  expect(providerToken).toBeTruthy();
});

afterAll(() => {
  fs.rmSync(TEST_DB, { force: true });
});

const validBooking = () => ({
  salonId: 'salon-1',
  serviceId: 'serv-1-1',
  staffId: 'staff-1-1',
  date: '2026-10-20',
  time: '10:30 AM',
  clientName: 'Regression Test',
  clientEmail: 'regression@leish.test',
  clientPhone: '+60123456789',
  notes: 'Phase 0 regression test',
});

const validMoodboard = () => ({
  lookName: 'Velvet Rose',
  palette: [{ hex: '#E6AABB', name: 'Rose' }],
  lipFormula: 'Muted rose (velvet matte)',
  eyeStyle: 'Soft almond smoke',
});

describe('GET /api/salons', () => {
  it('returns the seeded catalog', async () => {
    const res = await request(app).get('/api/salons');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((s: any) => s.id === 'salon-1')).toBe(true);
  });
});

describe('POST /api/bookings (defect 0.1)', () => {
  it('creates a booking with a YYYY-MM-DD date', async () => {
    const res = await request(app).post('/api/bookings').send(validBooking());

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.date).toBe('2026-10-20');
    expect(res.body.salonName).toBeTruthy();
    bookingId = res.body.id;
  });

  it('generates a well-formed id (defect 0.4)', async () => {
    expect(bookingId).toMatch(/^book-\d+-[a-z0-9]{6}$/);
    // The corrupted literal appended this literal text to every id:
    expect(bookingId).not.toContain('toString(36)');
    expect(bookingId).not.toContain('slice(2, 8)}');
  });

  it('rejects a malformed date with a 400', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ ...validBooking(), date: 'not-a-date' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/);
  });

  it('rejects a non-date suffix (the exact 0.1 regression)', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ ...validBooking(), date: '2026-10-20RM' });

    expect(res.status).toBe(400);
  });

  it('404s for an unknown salon', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ ...validBooking(), salonId: 'salon-does-not-exist' });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/bookings/:id/status (auth)', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(401);
  });

  it('rejects a malformed status with 400', async () => {
    const res = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'not-a-status' });

    expect(res.status).toBe(400);
  });

  it('lets a signed-in provider confirm a booking', async () => {
    const res = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
  });

  it('persists the transition for later reads (authenticated, scoped)', async () => {
    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${providerToken}`);
    expect(res.status).toBe(200);
    const found = res.body.find((b: any) => b.id === bookingId);
    expect(found).toBeTruthy();
    expect(found.status).toBe('confirmed');
  });
});

describe('stripJsonFences (defect 0.3)', () => {
  const look = '{"lookName":"Noir Ember"}';

  it('unwraps a ```json fence', () => {
    expect(stripJsonFences('```json\n' + look + '\n```')).toBe(look);
  });

  it('unwraps a bare ``` fence', () => {
    expect(stripJsonFences('```\n' + look + '\n```')).toBe(look);
  });

  it('leaves unfenced JSON untouched', () => {
    expect(stripJsonFences(look)).toBe(look);
  });

  it('parses after stripping (the original failure mode)', () => {
    const parsed = JSON.parse(stripJsonFences('```json' + look + '```'));
    expect(parsed.lookName).toBe('Noir Ember');
  });
});

describe('JWT configuration (TR-9)', () => {
  it('fails fast for missing or placeholder production secrets', () => {
    expect(() => getJwtSecret('production', undefined)).toThrow(/JWT_SECRET/i);
    expect(() => getJwtSecret('production', 'YOUR_JWT_SECRET_HERE')).toThrow(/JWT_SECRET/i);
    expect(() => getJwtSecret('production', 'leish-dev-secret-change-in-production')).toThrow(/JWT_SECRET/i);
  });

  it('accepts an explicitly configured production secret and preserves the dev fallback', () => {
    const rotatedSecret = 'a-long-rotated-secret-with-at-least-32-bytes';
    expect(getJwtSecret('production', rotatedSecret)).toBe(rotatedSecret);
    expect(getJwtSecret('test', undefined)).toBe('leish-dev-secret-change-in-production');
  });
});

describe('auth round-trip', () => {
  it('registers a user and resolves the session token', async () => {
    const email = `phase0-${Date.now()}@leish.test`;

    const reg = await request(app).post('/api/auth/register').send({
      name: 'Phase Zero',
      email,
      password: 'Sup3rSecret!',
      role: 'client',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.token).toBeTruthy();
    // defect 0.4: user ids must not carry literal template text
    expect(reg.body.user.id).toMatch(/^user-\d+-[a-z0-9]{6}$/);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);
    expect(me.body.password).toBeUndefined();
  });

  it('rejects a bad password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'aina@leish.test', password: 'wrong-password' });

    expect(res.status).toBe(401);
  });
});

describe('legacy plaintext password migration', () => {
  it('re-hashes plaintext rows found in a pre-bcrypt store', async () => {
    const legacyDb = `${TEST_DB}.legacy`;
    fs.rmSync(legacyDb, { force: true });

    // Build a store that mimics the real db_store.json: valid makeup catalog,
    // but users written BEFORE bcrypt was introduced (plaintext passwords).
    const base = JSON.parse(fs.readFileSync(TEST_DB, 'utf-8'));
    base.users = [{
      id: 'user-legacy-1',
      name: 'Legacy User',
      email: 'legacy@leish.test',
      password: 'password123', // plaintext — the actual defect
      role: 'client',
      createdAt: '2026-01-01T00:00:00.000Z',
    }];
    fs.writeFileSync(legacyDb, JSON.stringify(base, null, 2));

    vi.resetModules();
    const prevPath = process.env.LEISH_DB_PATH;
    process.env.LEISH_DB_PATH = legacyDb;
    try {
      const { store } = await import('./server/data-store.ts');
      const user = await store.getUserByEmail('legacy@leish.test');

      expect(user).toBeTruthy();
      // must now be a bcrypt hash, and must verify against the original secret
      expect(user!.password).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(user!.password).not.toBe('password123');
      expect(bcrypt.compareSync('password123', user!.password)).toBe(true);

      // persisted, so the fix survives a restart
      const reloaded = JSON.parse(fs.readFileSync(legacyDb, 'utf-8'));
      expect(reloaded.users[0].password).toMatch(/^\$2[aby]\$\d{2}\$/);
    } finally {
      process.env.LEISH_DB_PATH = prevPath;
      vi.resetModules();
      fs.rmSync(legacyDb, { force: true });
    }
  });
});

/**
 * Phase 1 — TR-7 authorization matrix.
 *
 * canUpdateSalon / canModifyBooking / completed-booking review eligibility:
 *   provider → only their own salon's listings, services and bookings
 *   client   → only bookings made with their own email; cancel-only status
 *   review   → only with a completed booking at that studio; name from account
 * Reads are authenticated: unauthenticated enumeration must 401.
 */
describe('TR-7 authorization matrix (Phase 1)', () => {
  let clientToken = '';         // mei@leish.test — client
  let otherProviderToken = '';  // siti@leish.test  — provider of salon-2
  let nosalonProviderToken = '';
  let clientBookingId = '';     // shamelali @ salon-1 (to cancel)
  let reviewBookingId = '';     // shamelali @ salon-1 (to complete, then review)
  let otherSalonBookingId = ''; // guest  @ salon-2 (cross-tenant probe)
  let addedServiceId = '';

  const login = async (email: string) => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'password123' });
    expect(res.status).toBe(200);
    return res.body.token;
  };

  beforeAll(async () => {
    clientToken = await login('mei@leish.test');
    otherProviderToken = await login('siti@leish.test');

    const book = (overrides: any) =>
      request(app).post('/api/bookings').send({ ...validBooking(), ...overrides });

    const other = await book({
      clientEmail: 'crosstenant@leish.test',
      clientName: 'Cross Tenant',
      salonId: 'salon-2', serviceId: 'serv-2-1', staffId: 'staff-2-1',
    });
    expect(other.status).toBe(201);
    otherSalonBookingId = other.body.id;

    const mine = await book({ clientEmail: 'mei@leish.test', clientName: 'Mei Ling' });
    expect(mine.status).toBe(201);
    clientBookingId = mine.body.id;

    const review = await book({ clientEmail: 'mei@leish.test', clientName: 'Mei Ling' });
    expect(review.status).toBe(201);
    reviewBookingId = review.body.id;
  });

  describe('booking reads are authenticated and scoped', () => {
    it('401s unauthenticated enumeration', async () => {
      const res = await request(app).get('/api/bookings');
      expect(res.status).toBe(401);
    });

    it('scopes a client to their own email (query params ignored)', async () => {
      const res = await request(app)
        .get('/api/bookings?email=crosstenant@leish.test')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      for (const b of res.body) {
        expect(b.clientEmail.toLowerCase()).toBe('mei@leish.test');
      }
      const ids = res.body.map((b: any) => b.id);
      expect(ids).toContain(clientBookingId);
      expect(ids).not.toContain(otherSalonBookingId);
    });

    it('scopes a provider to their own salon', async () => {
      const res = await request(app)
        .get('/api/bookings?salonId=salon-2')
        .set('Authorization', `Bearer ${providerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      for (const b of res.body) expect(b.salonId).toBe('salon-1');
      const ids = res.body.map((b: any) => b.id);
      expect(ids).not.toContain(otherSalonBookingId);
    });

    it('shows the foreign studio only to its own provider', async () => {
      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${otherProviderToken}`);
      expect(res.status).toBe(200);
      const ids = res.body.map((b: any) => b.id);
      expect(ids).toContain(otherSalonBookingId);
      expect(ids).not.toContain(clientBookingId);
    });

    it('403s a provider account with no linked salon', async () => {
      const reg = await request(app).post('/api/auth/register').send({
        name: 'Unlinked Provider',
        email: `nosalon-${Date.now()}@leish.test`,
        password: 'Sup3rSecret!',
        role: 'provider',
      });
      expect(reg.status).toBe(201);
      nosalonProviderToken = reg.body.token;

      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${nosalonProviderToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('salon writes are owner-only', () => {
    it('does not let a registering provider claim an existing salon', async () => {
      const reg = await request(app).post('/api/auth/register').send({
        name: 'Unverified Provider',
        email: `claim-${Date.now()}@leish.test`,
        password: 'Sup3rSecret!',
        role: 'provider',
        salonId: 'salon-1',
      });
      expect(reg.status).toBe(201);
      expect(reg.body.user.salonId).toBeUndefined();

      const edit = await request(app)
        .put('/api/salons/salon-1')
        .set('Authorization', `Bearer ${reg.body.token}`)
        .send({ tagline: 'Claimed via signup' });
      expect(edit.status).toBe(403);
    });

    it('401s unauthenticated updates', async () => {
      const res = await request(app)
        .put('/api/salons/salon-1')
        .send({ tagline: 'nope' });
      expect(res.status).toBe(401);
    });

    it('403s a client editing a salon', async () => {
      const res = await request(app)
        .put('/api/salons/salon-1')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ tagline: 'client takeover' });
      expect(res.status).toBe(403);
    });

    it('403s a foreign provider (cross-tenant)', async () => {
      const res = await request(app)
        .put('/api/salons/salon-1')
        .set('Authorization', `Bearer ${otherProviderToken}`)
        .send({ tagline: 'tenant takeover' });
      expect(res.status).toBe(403);
    });

    it('lets the owner update but strips mass-assigned fields', async () => {
      const res = await request(app)
        .put('/api/salons/salon-1')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ tagline: 'Owner updated this', rating: 9.9, reviewCount: 999, id: 'salon-hack' });

      expect(res.status).toBe(200);
      expect(res.body.tagline).toBe('Owner updated this');
      expect(res.body.id).toBe('salon-1');
      expect(res.body.rating).toBeLessThan(6);   // rating is not client-writable
      expect(res.body.reviewCount).toBeLessThan(999);
    });

    it('403s a client adding services', async () => {
      const res = await request(app)
        .post('/api/salons/salon-1/services')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ name: 'Sneaky Service', price: 1, duration: 5 });
      expect(res.status).toBe(403);
    });

    it('400s an invalid service payload from the owner', async () => {
      const res = await request(app)
        .post('/api/salons/salon-1/services')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ name: '', price: 'NaN', duration: 0 });
      expect(res.status).toBe(400);
    });

    it('lets the owner add a service', async () => {
      const res = await request(app)
        .post('/api/salons/salon-1/services')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ name: 'Authz Matrix Blend', price: 145, duration: 60 });

      expect(res.status).toBe(201);
      const svc = res.body.services.find((s: any) => s.name === 'Authz Matrix Blend');
      expect(svc).toBeTruthy();
      expect(svc.price).toBe(145);
      addedServiceId = svc.id;
    });

    it('rejects a client editing a service', async () => {
      const res = await request(app)
        .put(`/api/salons/salon-1/services/${addedServiceId}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ name: 'Client Takeover', price: 1, duration: 5, description: '', category: 'glam' });
      expect(res.status).toBe(403);
    });

    it('lets the owner edit service fields while preserving the service ID', async () => {
      const res = await request(app)
        .put(`/api/salons/salon-1/services/${addedServiceId}`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          id: 'service-id-takeover',
          name: 'Authz Matrix Blend Updated',
          price: 175,
          duration: 75,
          description: 'Updated service description',
          category: 'editorial',
        });

      expect(res.status).toBe(200);
      const updated = res.body.services.find((service: any) => service.id === addedServiceId);
      expect(updated).toMatchObject({
        id: addedServiceId,
        name: 'Authz Matrix Blend Updated',
        price: 175,
        duration: 75,
        description: 'Updated service description',
        category: 'editorial',
      });
      expect(res.body.services.some((service: any) => service.id === 'service-id-takeover')).toBe(false);
    });

    it('rejects invalid service edits without changing the service', async () => {
      const res = await request(app)
        .put(`/api/salons/salon-1/services/${addedServiceId}`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ name: '', price: -1, duration: 0 });

      expect(res.status).toBe(400);
      const salon = await request(app).get('/api/salons/salon-1');
      const unchanged = salon.body.services.find((service: any) => service.id === addedServiceId);
      expect(unchanged).toMatchObject({ name: 'Authz Matrix Blend Updated', price: 175 });
    });

    it('403s a client deleting services, 404s an unknown service', async () => {
      const forbidden = await request(app)
        .delete(`/api/salons/salon-1/services/${addedServiceId}`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(forbidden.status).toBe(403);

      const unknown = await request(app)
        .delete('/api/salons/salon-1/services/serv-does-not-exist')
        .set('Authorization', `Bearer ${providerToken}`);
      expect(unknown.status).toBe(404);

      const removed = await request(app)
        .delete(`/api/salons/salon-1/services/${addedServiceId}`)
        .set('Authorization', `Bearer ${providerToken}`);
      expect(removed.status).toBe(200);
      expect(removed.body.services.some((s: any) => s.id === addedServiceId)).toBe(false);
    });
  });

  it('does not allow a provider to self-reassign their managed salon', async () => {
    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ id: 'user-provider-1', salonId: 'salon-2' });

    expect(res.status).toBe(200);
    expect(res.body.user.salonId).toBe('salon-1');
  });

  describe('booking status transitions', () => {
    it('404s an unknown booking id', async () => {
      const res = await request(app)
        .patch('/api/bookings/book-none/status')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'confirmed' });
      expect(res.status).toBe(404);
    });

    it('403s a foreign provider touching another studio\'s booking', async () => {
      const res = await request(app)
        .patch(`/api/bookings/${reviewBookingId}/status`)
        .set('Authorization', `Bearer ${otherProviderToken}`)
        .send({ status: 'confirmed' });
      expect(res.status).toBe(403);
    });

    it('lets the owning client cancel their own booking', async () => {
      const res = await request(app)
        .patch(`/api/bookings/${clientBookingId}/status`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ status: 'cancelled' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
    });

    it('blocks a client confirming (or otherwise moving) their booking', async () => {
      const res = await request(app)
        .patch(`/api/bookings/${reviewBookingId}/status`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ status: 'confirmed' });
      expect(res.status).toBe(403);
      expect(String(res.body.error)).toMatch(/cancel/i);
    });

    it('lets the owning provider complete a booking (review setup)', async () => {
      const res = await request(app)
        .patch(`/api/bookings/${reviewBookingId}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'completed' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
    });
  });

  describe('review gating and uniqueness', () => {
    const reviewBody = (overrides: any = {}) => ({
      salonId: 'salon-1',
      clientName: 'ZZZ Spoofed Name',
      rating: 5,
      text: 'Authz matrix review test.',
      ...overrides,
    });

    it('401s unauthenticated reviews', async () => {
      const res = await request(app).post('/api/reviews').send(reviewBody());
      expect(res.status).toBe(401);
    });

    it('403s a client with no completed booking there', async () => {
      const reg = await request(app).post('/api/auth/register').send({
        name: 'Never Booked',
        email: `nobook-${Date.now()}@leish.test`,
        password: 'Sup3rSecret!',
        role: 'client',
      });
      expect(reg.status).toBe(201);

      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${reg.body.token}`)
        .send(reviewBody());
      expect(res.status).toBe(403);
      expect(String(res.body.error)).toMatch(/completed booking/i);
    });

    it('403s a completed-booking client reviewing a different studio', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${clientToken}`)
        .send(reviewBody({ salonId: 'salon-2' }));
      expect(res.status).toBe(403);
    });

    it('accepts a verified review and takes the name from the account', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${clientToken}`)
        .send(reviewBody({ bookingId: reviewBookingId }));
      expect(res.status).toBe(201);
      expect(res.body.clientName).toBe('Mei Ling'); // never the spoofed body
      expect(res.body.rating).toBe(5);
      expect(res.body.reviewerId).toBe('user-client-1');
      expect(res.body.bookingId).toBe(reviewBookingId);
    });

    it('keeps submitted reviews publicly readable', async () => {
      const email = `reader-${Date.now()}@leish.test`;
      const reg = await request(app).post('/api/auth/register').send({
        name: 'Reader', email, password: 'Sup3rSecret!', role: 'client',
      });
      expect(reg.status).toBe(201);
      const made = await request(app).post('/api/bookings').send({ ...validBooking(), clientEmail: email });
      expect(made.status).toBe(201);
      const completed = await request(app)
        .patch(`/api/bookings/${made.body.id}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'completed' });
      expect(completed.status).toBe(200);
      const posted = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${reg.body.token}`)
        .send(reviewBody({ bookingId: made.body.id }));
      expect(posted.status).toBe(201);
      const res = await request(app).get('/api/reviews/salon-1');
      expect(res.status).toBe(200);
      expect(res.body.some((review: any) => review.id === posted.body.id)).toBe(true);
    });

    it('allows only one review for the same completed booking and reviewer', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${clientToken}`)
        .send(reviewBody({ bookingId: reviewBookingId }));
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already reviewed/i);
    });

    it('blocks provider accounts from customer reviews, including self-review', async () => {
      const booking = await request(app)
        .post('/api/bookings')
        .send({
          ...validBooking(),
          clientEmail: 'aina@leish.test',
          clientName: 'Aina Rahman',
        });
      expect(booking.status).toBe(201);

      const completed = await request(app)
        .patch(`/api/bookings/${booking.body.id}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'completed' });
      expect(completed.status).toBe(200);

      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${providerToken}`)
        .send(reviewBody({ bookingId: booking.body.id }));
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/client accounts/i);
    });
  });

  describe('quality-audit authorization', () => {
    let adminToken = '';

    beforeAll(async () => {
      const email = `quality-admin-${process.pid}@leish.test`;
      await testStore.createUser({
        id: `quality-admin-${process.pid}`,
        name: 'Quality Admin',
        email,
        password: 'password123',
        role: 'admin',
        createdAt: new Date().toISOString(),
      });
      adminToken = await login(email);
    });

    it('requires authentication before spending the audit quota', async () => {
      const res = await request(app)
        .post('/api/gemini/quality-audit')
        .send({ salonId: 'salon-1' });
      expect(res.status).toBe(401);
    });

    it('only lets the owning provider audit its salon', async () => {
      const res = await request(app)
        .post('/api/gemini/quality-audit')
        .set('Authorization', `Bearer ${otherProviderToken}`)
        .send({ salonId: 'salon-1' });
      expect(res.status).toBe(403);
    });

    it('allows the owner and admin, with the keyless deterministic audit fallback', async () => {
      const owner = await request(app)
        .post('/api/gemini/quality-audit')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ salonId: 'salon-1' });
      expect(owner.status).toBe(200);
      expect(owner.body.salonName).toBe('Maison Leish Haute Makeup Atelier');

      const admin = await request(app)
        .post('/api/gemini/quality-audit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ salonId: 'salon-2' });
      expect(admin.status).toBe(200);
      expect(admin.body.salonName).toBe('L’Éclat Makeup & Airbrush Lab');
    });
  });

  it('removed GET /api/auth/demo-accounts (it listed every user\'s PII)', async () => {
    const res = await request(app).get('/api/auth/demo-accounts');
    expect(res.status).toBe(404);
    expect(Array.isArray(res.body)).toBe(false);
  });
});

describe('booking input hardening', () => {
  it.each([
    ['non-leap February', { date: '2026-02-29' }],
    ['century non-leap February', { date: '2100-02-29' }],
    ['February overflow', { date: '2028-02-30' }],
    ['April overflow', { date: '2026-04-31' }],
    ['zero day', { date: '2026-10-00' }],
    ['zero month', { date: '2026-00-20' }],
    ['month overflow', { date: '2026-13-20' }],
    ['zero year', { date: '0000-01-01' }],
    ['arbitrary time', { time: 'whenever' }],
    ['zero 12-hour clock hour', { time: '00:30 AM' }],
    ['hour overflow', { time: '13:30 PM' }],
    ['minute overflow', { time: '10:60 AM' }],
    ['missing meridiem', { time: '10:30' }],
    ['blank name', { clientName: '   ' }],
    ['blank email', { clientEmail: '   ' }],
    ['missing phone', { clientPhone: undefined }],
    ['blank phone', { clientPhone: '   ' }],
    ['oversized phone', { clientPhone: '1'.repeat(51) }],
    ['negative travel fee', { travelSurcharge: -1 }],
    ['non-numeric travel fee', { travelSurcharge: '50' }],
    ['missing event venue', { isLocationEvent: true }],
    ['blank event venue', { isLocationEvent: true, eventVenue: '   ' }],
  ])('rejects %s without saving a booking', async (_label, overrides) => {
    const before = JSON.parse(fs.readFileSync(TEST_DB, 'utf-8')).bookings;
    const res = await request(app).post('/api/bookings').send({ ...validBooking(), ...overrides });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
    expect(JSON.parse(fs.readFileSync(TEST_DB, 'utf-8')).bookings).toEqual(before);
  });

  it.each([
    ['null', null],
    ['string', 'a look'],
    ['array', []],
    ['missing fields', { lookName: 'Incomplete' }],
    ['blank look name', { ...validMoodboard(), lookName: ' ' }],
    ['oversized look name', { ...validMoodboard(), lookName: 'x'.repeat(121) }],
    ['empty palette', { ...validMoodboard(), palette: [] }],
    ['oversized palette', { ...validMoodboard(), palette: Array(11).fill({ hex: '#FFFFFF', name: 'White' }) }],
    ['non-hex color', { ...validMoodboard(), palette: [{ hex: 'red', name: 'Red' }] }],
    ['blank swatch name', { ...validMoodboard(), palette: [{ hex: '#FFFFFF', name: ' ' }] }],
    ['object lip formula', { ...validMoodboard(), lipFormula: { shade: 'Rose' } }],
    ['oversized eye style', { ...validMoodboard(), eyeStyle: 'x'.repeat(501) }],
    ['unknown moodboard field', { ...validMoodboard(), arbitrary: { payload: true } }],
    ['unknown swatch field', { ...validMoodboard(), palette: [{ hex: '#FFFFFF', name: 'White', extra: true }] }],
  ])('rejects a malformed moodboard: %s', async (_label, attachedMoodboard) => {
    const before = JSON.parse(fs.readFileSync(TEST_DB, 'utf-8')).bookings;
    const res = await request(app).post('/api/bookings').send({ ...validBooking(), attachedMoodboard });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
    expect(JSON.parse(fs.readFileSync(TEST_DB, 'utf-8')).bookings).toEqual(before);
  });

  it.each([
    ['2028-02-29', '12:00 AM'],
    ['2000-02-29', '12:00 PM'],
    ['2026-04-30', '09:00 AM'],
    ['2026-12-31', '11:59 PM'],
  ])('accepts calendar date %s and clock time %s for a guest', async (date, time) => {
    const res = await request(app).post('/api/bookings').send({ ...validBooking(), date, time });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ date, time, status: 'pending' });
  });

  it('accepts the on-location moodboard payload and trims contact/venue text', async () => {
    const res = await request(app).post('/api/bookings').send({
      ...validBooking(),
      clientName: '  Guest Client  ',
      clientEmail: '  guest@leish.test  ',
      clientPhone: '  +60 12 345 6789  ',
      isLocationEvent: true,
      eventVenue: '  Grand Ballroom, Kuala Lumpur  ',
      travelSurcharge: 50.5,
      attachedMoodboard: validMoodboard(),
      status: 'completed',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      clientName: 'Guest Client', clientEmail: 'guest@leish.test', clientPhone: '+60 12 345 6789',
      isLocationEvent: true, eventVenue: 'Grand Ballroom, Kuala Lumpur', travelSurcharge: 50.5,
      attachedMoodboard: validMoodboard(), status: 'pending',
    });
  });

  it('accepts an in-studio guest booking with no venue and zero travel fee', async () => {
    const res = await request(app).post('/api/bookings').send({
      ...validBooking(), isLocationEvent: false, travelSurcharge: 0,
    });
    expect(res.status).toBe(201);
    expect(res.body.isLocationEvent).toBe(false);
    expect(res.body.eventVenue).toBeUndefined();
  });
});

describe('booking status privilege boundaries', () => {
  let clientToken = '';
  let unlinkedToken = '';
  const unlinkedEmail = 'status-unlinked@leish.test';

  beforeAll(async () => {
    const login = await request(app).post('/api/auth/login').send({
      email: 'mei@leish.test', password: 'password123',
    });
    expect(login.status).toBe(200);
    clientToken = login.body.token;
    const registration = await request(app).post('/api/auth/register').send({
      name: 'Unlinked Customer Provider', email: unlinkedEmail, password: 'Sup3rSecret!', role: 'provider',
    });
    expect(registration.status).toBe(201);
    unlinkedToken = registration.body.token;
  });

  const update = (id: string, token: string, status: BookingStatus) => request(app)
    .patch(`/api/bookings/${id}/status`).set('Authorization', `Bearer ${token}`).send({ status });

  const savedStatus = (id: string) => JSON.parse(fs.readFileSync(TEST_DB, 'utf-8'))
    .bookings.find((booking: { id: string }) => booking.id === id).status;

  // All three callers are customers of salon-1; only one has a provider role
  // with a linked salon, and that salon is deliberately salon-2.
  describe.each(['client', 'foreign provider', 'unlinked provider'] as const)('%s as customer', (actor) => {
    let token = '';
    let email = '';

    beforeAll(async () => {
      if (actor === 'client') {
        token = clientToken;
        email = 'mei@leish.test';
      } else if (actor === 'unlinked provider') {
        token = unlinkedToken;
        email = unlinkedEmail;
      } else {
        email = 'siti@leish.test';
        const login = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
        expect(login.status).toBe(200);
        token = login.body.token;
      }
    });

    const book = async (status: BookingStatus = 'pending') => {
      const created = await request(app).post('/api/bookings').send({
        ...validBooking(), clientEmail: email.toUpperCase(),
      });
      expect(created.status).toBe(201);
      if (status !== 'pending') {
        expect((await update(created.body.id, providerToken, status)).status).toBe(200);
      }
      return created.body.id as string;
    };

    it.each(['pending', 'confirmed', 'completed'] as const)('cannot set status to %s', async (status) => {
      const id = await book();
      const res = await update(id, token, status);
      expect(res.status).toBe(403);
      expect(savedStatus(id)).toBe('pending');
    });

    it.each(['pending', 'confirmed'] as const)('can cancel a %s booking', async (status) => {
      const id = await book(status);
      const res = await update(id, token, 'cancelled');
      expect(res.status).toBe(200);
      expect(savedStatus(id)).toBe('cancelled');
    });

    it.each(['completed', 'cancelled'] as const)('cannot cancel a %s booking', async (status) => {
      const id = await book(status);
      const res = await update(id, token, 'cancelled');
      expect(res.status).toBe(403);
      expect(savedStatus(id)).toBe(status);
    });
  });

  it('preserves the owning provider workflow, including when also the customer', async () => {
    const created = await request(app).post('/api/bookings').send({
      ...validBooking(), clientEmail: 'aina@leish.test',
    });
    expect(created.status).toBe(201);
    for (const status of ['confirmed', 'completed', 'cancelled', 'pending'] as const) {
      const res = await update(created.body.id, providerToken, status);
      expect(res.status).toBe(200);
      expect(savedStatus(created.body.id)).toBe(status);
    }
  });
});

describe('salon partial update validation', () => {
  const update = (body: object) => request(app).put('/api/salons/salon-1')
    .set('Authorization', `Bearer ${providerToken}`).send(body);

  it.each([
    ['array body', []],
    ['blank name', { name: '   ' }],
    ['null services', { services: null }],
    ['object services', { services: {} }],
    ['incomplete service', { services: [{ id: 'broken', name: 'Broken' }] }],
    ['negative service price', { services: [{ id: 's', name: 'S', description: '', category: 'glam', price: -1, duration: 60 }] }],
    ['zero service duration', { services: [{ id: 's', name: 'S', description: '', category: 'glam', price: 50, duration: 0 }] }],
    ['null working hours', { workingHours: null }],
    ['array working hours', { workingHours: [] }],
    ['invalid weekday', { workingHours: { Funday: 'Closed' } }],
    ['object hours value', { workingHours: { Monday: { open: '09:00' } } }],
    ['oversized hours', { workingHours: { Monday: 'x'.repeat(101) } }],
    ['null staff', { staff: null }],
    ['incomplete staff', { staff: [{ id: 'broken', name: 'Broken' }] }],
    ['invalid staff rating', { staff: [{ id: 's', name: 'S', role: 'MUA', avatar: 'https://example.com/avatar.jpg', rating: 6 }] }],
    ['null gallery', { gallery: null }],
    ['non-string gallery entry', { gallery: [42] }],
    ['unsafe image URL', { image: 'javascript:alert(1)' }],
    ['string featured flag', { featured: 'true' }],
    ['negative experience', { yearsExperience: -1 }],
    ['non-array kit brands', { kitBrands: 'Dior' }],
    ['numeric travel radius', { travelRadius: 50 }],
    ['negative starting price', { startingPrice: -1 }],
  ])('rejects %s atomically', async (_label, body) => {
    const original = (await request(app).get('/api/salons/salon-1')).body;
    try {
      const res = await update(Array.isArray(body) ? body : { tagline: 'Must not be saved', ...body });
      expect(res.status).toBe(400);
      expect(res.body.error).toEqual(expect.any(String));
      const after = await request(app).get('/api/salons/salon-1');
      expect(after.body).toEqual(original);
    } finally {
      // Keep regressions independent even when running against the vulnerable route.
      expect((await update(original)).status).toBe(200);
    }
  });

  it('accepts the dashboard profile payload without replacing omitted fields', async () => {
    const original = (await request(app).get('/api/salons/salon-1')).body;
    const body = {
      tagline: 'Updated tagline', description: '', address: 'Updated KL address',
      workingHours: { Monday: '09:00 AM - 07:00 PM', Tuesday: 'By appointment', Sunday: 'Closed' },
    };
    try {
      const res = await update(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...original, ...body });
    } finally {
      expect((await update(original)).status).toBe(200);
    }
  });

  it('accepts typed service, staff, gallery and MUA fields, stripping protected fields', async () => {
    const original = (await request(app).get('/api/salons/salon-1')).body;
    const body = {
      services: [{ ...original.services[0], price: 0, duration: 45, description: '' }],
      staff: [original.staff[0]], gallery: ['https://example.com/gallery.jpg'], featured: false,
      artistTitle: 'Mobile MUA', yearsExperience: 0, kitBrands: ['Dior'], travelRadius: '50 km',
      instagramHandle: '@artist', startingPrice: 0,
    };
    try {
      const res = await update({ ...body, id: 'hijacked', type: 'mua', rating: 99, reviewCount: 999 });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...original, ...body });
      expect((await request(app).get('/api/salons/salon-1')).body).toEqual(res.body);
    } finally {
      expect((await update(original)).status).toBe(200);
    }
  });
});

describe('demo username accounts (auth modal Instant Demo Access)', () => {
  it('rejects an unknown username with 401 instead of a format error', async () => {
    // Login accepts non-email identifiers and routes them to lookup.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'client', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  it('accepts a demo username as the booking contact email', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ ...validBooking(), clientEmail: 'client' });
    expect(res.status).toBe(201);
    expect(res.body.clientEmail).toBe('client');
  });
});

describe('OAuth session exchange (POST /api/auth/oauth)', () => {
  it('rejects a missing token with 401', async () => {
    const res = await request(app).post('/api/auth/oauth').send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual(expect.any(String));
  });

  it('returns 503 when Supabase Auth is unconfigured', async () => {
    // Test env sets no SUPABASE_URL / SUPABASE_ANON_KEY.
    const res = await request(app)
      .post('/api/auth/oauth')
      .set('Authorization', 'Bearer dummy-token')
      .send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not configured/);
  });
});

describe('venue travel estimates (live Distance Matrix with sample fallback)', () => {
  const payload = { salonId: 'salon-1', venue: 'KLCC Convention Centre' };

  it("serves a labelled sample estimate when no server key is configured", async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    const res = await request(app).post('/api/venue/estimate-travel').send(payload);
    expect(res.status).toBe(200);
    expect(res.body.estimateSource).toBe('sample');
    expect(res.body.distanceKm).toEqual(expect.any(Number));
    expect(res.body.totalTravelFee).toEqual(expect.any(Number));
  });

  it('serves a live estimate when the Distance Matrix responds OK', async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = 'test-key';
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: 'OK',
        rows: [{ elements: [{ status: 'OK', distance: { value: 12500 }, duration: { value: 1500 } }] }],
      }),
    }));
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const res = await request(app).post('/api/venue/estimate-travel').send(payload);
      expect(res.status).toBe(200);
      expect(res.body.estimateSource).toBe('live');
      expect(res.body.distanceKm).toBe(12.5);
      expect(res.body.estimatedDriveMinutes).toBe(25);
    } finally {
      vi.unstubAllGlobals();
      delete process.env.GOOGLE_MAPS_SERVER_KEY;
    }
  });
});

describe('booking confirmation email hook', () => {
  it('attempts a confirmation email when a booking is confirmed', async () => {
    const created = await request(app).post('/api/bookings').send(validBooking());
    expect(created.status).toBe(201);
    process.env.BREVO_API_KEY = 'test-key';
    const fetchSpy = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const res = await request(app)
        .patch(`/api/bookings/${created.body.id}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'confirmed' });
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledOnce();
      const calls = fetchSpy.mock.calls as unknown as Array<[string]>;
      expect(calls[0][0]).toBe('https://api.brevo.com/v3/smtp/email');
    } finally {
      vi.unstubAllGlobals();
      delete process.env.BREVO_API_KEY;
    }
  });

  it('still confirms when email is unconfigured (no key, no send)', async () => {
    delete process.env.BREVO_API_KEY;
    const created = await request(app).post('/api/bookings').send(validBooking());
    expect(created.status).toBe(201);
    const res = await request(app)
      .patch(`/api/bookings/${created.body.id}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
  });
});

describe('Vercel rewrite envelope (GET /api/[...path]?...path=…)', () => {
  it('routes single-segment API paths carried in the ...path param', async () => {
    const res = await request(app).get('/api/[...path]').query({ '...path': 'salons' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('routes multi-segment paths and preserves the remaining query string', async () => {
    const email = `envelope-${Date.now()}@leish.test`;
    const reg = await request(app).post('/api/auth/register').send({
      name: 'Envelope', email, password: 'password123', role: 'client',
    });
    expect(reg.status).toBe(201);
    const res = await request(app)
      .post('/api/[...path]')
      .query({ '...path': 'auth/login' })
      .send({ email, password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });
});

describe('admin salon creation (POST /api/salons)', () => {
  const listing = () => ({
    name: 'Seri Kembangan Glow Atelier',
    category: 'bridal',
    location: 'Seri Kembangan',
    address: '21 Jalan SK 6/1, Seri Kembangan, Selangor',
  });
  let adminToken = '';
  let providerToken = '';

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'shamel@leish.my', password: 'lindan95' });
    expect(admin.status).toBe(200);
    adminToken = admin.body.token;
    const provider = await request(app)
      .post('/api/auth/login')
      .send({ email: 'aina@leish.test', password: 'password123' });
    expect(provider.status).toBe(200);
    providerToken = provider.body.token;
  });

  it('creates a listing with server defaults as admin', async () => {
    const res = await request(app)
      .post('/api/salons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(listing());
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^salon-/);
    expect(res.body).toMatchObject({ name: 'Seri Kembangan Glow Atelier', rating: 0, reviewCount: 0, featured: false });
    expect(res.body.services).toEqual([]);
    expect(res.body.staff).toEqual([]);
    expect(res.body).not.toHaveProperty('password');

    const fetched = await request(app).get(`/api/salons/${res.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.name).toBe('Seri Kembangan Glow Atelier');
  });

  it('403s providers and 401s anonymous callers', async () => {
    expect((await request(app).post('/api/salons').set('Authorization', `Bearer ${providerToken}`).send(listing())).status).toBe(403);
    expect((await request(app).post('/api/salons').send(listing())).status).toBe(401);
  });

  it('400s on missing identity fields', async () => {
    const res = await request(app)
      .post('/api/salons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ category: 'bridal' });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });
});

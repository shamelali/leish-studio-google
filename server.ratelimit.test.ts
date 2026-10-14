/**
 * Phase 1 — rate-limit buckets (TR-8).
 *
 * Deliberately runs WITHOUT LEISH_DISABLE_RATE_LIMIT so the real buckets
 * are active, and in its own vitest file so its request counts (and its
 * temp store) never bleed into the authz-matrix suite.
 *
 * TR-8 acceptance: an AI burst cannot starve login — the buckets are
 * per-domain: auth (20 / 15 min), AI (15 / min), reads (120 / min).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';

const TEST_DB = '/tmp/opencode/leish-ratelimit-db.json';
process.env.LEISH_DB_PATH = TEST_DB;
delete process.env.LEISH_DISABLE_RATE_LIMIT;
fs.rmSync(TEST_DB, { force: true });

let app: any;

beforeAll(async () => {
  const mod = await import('./server.ts');
  app = mod.default;
});

afterAll(() => {
  fs.rmSync(TEST_DB, { force: true });
});

describe('rate-limit buckets (TR-8)', () => {
  it('caps AI traffic but leaves login untouched', async () => {
    // 15 AI requests per minute are allowed; the 16th must trip the bucket.
    let blocked = 0;
    for (let i = 0; i < 16; i++) {
      const res = await request(app).post('/api/gemini/advice').send({});
      if (res.status === 429) blocked++;
    }
    expect(blocked).toBe(1);

    // …while a login still succeeds: the auth bucket has its own budget.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'director@atelierleish.com', password: 'password123' });
    expect(login.status).toBe(200);
  });

  it('caps reads independently of auth', async () => {
    // 120 reads per minute; the 121st trips the read bucket…
    let blocked = 0;
    for (let i = 0; i < 121; i++) {
      const res = await request(app).get('/api/salons');
      if (res.status === 429) blocked++;
    }
    expect(blocked).toBe(1);

    // …but login still works (it is skipped by the read bucket).
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'director@atelierleish.com', password: 'password123' });
    expect(login.status).toBe(200);
  });

  it('caps repeated auth attempts', async () => {
    // Auth budget: 20 / 15 min (2 already spent above). Burn it with
    // deliberately wrong credentials; the limiter must answer 429 before
    // bcrypt is ever reached again.
    let last: any;
    for (let i = 0; i < 21; i++) {
      last = await request(app)
        .post('/api/auth/login')
        .send({ email: 'director@atelierleish.com', password: 'definitely-wrong' });
    }
    expect(last.status).toBe(429);
    expect(String(last.body.error)).toMatch(/attempts|requests/i);
  });
});

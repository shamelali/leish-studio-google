import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';

// Live integration: exercises the Supabase Auth bridge end to end
// (register, login, OAuth provisioning, duplicates). Runs only when
// Supabase credentials are present; the offline suite covers the legacy
// bcrypt path. Cleans up every Auth user and profile row it creates.
const supabaseEnabled = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

let app: any;
const createdAuthIds: string[] = [];
const createdProfileIds: string[] = [];

const service = () =>
  createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const anon = () =>
  createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

beforeAll(async () => {
  if (!supabaseEnabled) return;
  process.env.LEISH_DB_PATH = `/tmp/opencode/leish-supabase-auth-${process.pid}.json`;
  process.env.STORE_BACKEND = 'json';
  app = (await import('../server.ts')).default;
});

afterAll(async () => {
  if (!supabaseEnabled) return;
  const admin = service();
  const settle = async (work: { then: (ok: () => void, err: () => void) => unknown }) => {
    await new Promise<void>(resolve => {
      work.then(
        () => resolve(),
        () => resolve(),
      );
    });
  };
  for (const id of createdAuthIds) {
    await settle(admin.auth.admin.deleteUser(id));
  }
  for (const id of createdProfileIds) {
    await settle(admin.from('users').delete().eq('id', id));
  }
});

describe.skipIf(!supabaseEnabled)('Supabase Auth bridge', () => {
  it('registers, logs in, and rejects duplicates through Supabase', async () => {
    const email = `sbauth-${Date.now()}@leish.test`;
    const reg = await request(app).post('/api/auth/register').send({
      name: 'Supabase User',
      email,
      password: 'Sup3rSecret!',
      role: 'client',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.user.email).toBe(email);
    expect(reg.body.token).toBeTruthy();
    // Profile id is the Auth id, so one entry cleans up both rows.
    createdAuthIds.push(reg.body.user.id);
    createdProfileIds.push(reg.body.user.id);

    const dup = await request(app).post('/api/auth/register').send({
      name: 'Supabase User',
      email,
      password: 'Sup3rSecret!',
      role: 'client',
    });
    expect(dup.status).toBe(400);

    const login = await request(app).post('/api/auth/login').send({ email, password: 'Sup3rSecret!' });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe(email);

    const bad = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });
    expect(bad.status).toBe(401);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);
  });

  it('provisions an app profile on first OAuth exchange', async () => {
    const email = `sboauth-${Date.now()}@leish.test`;
    const created = await service().auth.admin.createUser({ email, password: 'Sup3rSecret!', email_confirm: true });
    expect(created.error).toBeNull();
    createdAuthIds.push(created.data.user.id);

    const session = await anon().auth.signInWithPassword({ email, password: 'Sup3rSecret!' });
    expect(session.error).toBeNull();
    const accessToken = session.data.session?.access_token;
    expect(accessToken).toBeTruthy();

    const first = await request(app)
      .post('/api/auth/oauth')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(first.status).toBe(200);
    expect(first.body.user.email).toBe(email);
    expect(first.body.user.id).toBe(created.data.user.id);
    createdProfileIds.push(first.body.user.id);

    const second = await request(app)
      .post('/api/auth/oauth')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);
  });

  it('rejects forged OAuth tokens with 401', async () => {
    const res = await request(app)
      .post('/api/auth/oauth')
      .set('Authorization', 'Bearer forged-token')
      .send({});
    expect(res.status).toBe(401);
  });
});

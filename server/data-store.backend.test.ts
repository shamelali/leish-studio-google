import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'leish-backend-test-'));
const jsonPath = join(directory, 'store.json');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  rmSync(jsonPath, { force: true });
});

describe('store backend selection', () => {
  it('uses the JSON store by default', async () => {
    vi.stubEnv('STORE_BACKEND', undefined);
    vi.stubEnv('LEISH_DB_PATH', jsonPath);
    const { JsonDataStore, store } = await import('./data-store.ts');
    expect(store).toBeInstanceOf(JsonDataStore);
    expect(existsSync(jsonPath)).toBe(true);
  });

  it('selects Firestore without initializing the JSON store', async () => {
    vi.stubEnv('STORE_BACKEND', 'firestore');
    vi.stubEnv('LEISH_DB_PATH', jsonPath);
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:1');
    vi.stubEnv('FIREBASE_PROJECT_ID', 'demo-backend-selection');
    const { store } = await import('./data-store.ts');
    const { FirestoreStore } = await import('./firestore-store.ts');
    expect(store).toBeInstanceOf(FirestoreStore);
    await store.save(); // Connection setup is local; no emulator request is made.
    expect(existsSync(jsonPath)).toBe(false);
  });

  it('rejects an unknown backend before initializing a store', async () => {
    vi.stubEnv('STORE_BACKEND', 'other');
    vi.stubEnv('LEISH_DB_PATH', jsonPath);
    await expect(import('./data-store.ts')).rejects.toThrow('Unknown STORE_BACKEND: other');
    expect(existsSync(jsonPath)).toBe(false);
  });

  it('fails clearly when production has no explicitly configured durable backend', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STORE_BACKEND', undefined);
    vi.stubEnv('LEISH_DB_PATH', jsonPath);

    await expect(import('./data-store.ts')).rejects.toThrow(/production requires a durable backend/i);
    expect(existsSync(jsonPath)).toBe(false);
  });

  it('does not permit the JSON backend in production even when a path is supplied', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STORE_BACKEND', 'json');
    vi.stubEnv('LEISH_DB_PATH', jsonPath);

    await expect(import('./data-store.ts')).rejects.toThrow(/production requires a durable backend/i);
    expect(existsSync(jsonPath)).toBe(false);
  });

  it('selects Supabase without initializing the JSON store', async () => {
    vi.stubEnv('STORE_BACKEND', 'supabase');
    vi.stubEnv('LEISH_DB_PATH', jsonPath);
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');

    const { store } = await import('./data-store.ts');
    const { SupabaseStore } = await import('./supabase-store.ts');
    expect(store).toBeInstanceOf(SupabaseStore);
    expect(existsSync(jsonPath)).toBe(false);
  });

  it('serves the seeded ephemeral catalog when the staging hatch is set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STORE_BACKEND', undefined);
    vi.stubEnv('LEISH_DB_PATH', jsonPath);
    vi.stubEnv('LEISH_ALLOW_EPHEMERAL_DEMO', '1');

    const { JsonDataStore, store } = await import('./data-store.ts');
    expect(store).toBeInstanceOf(JsonDataStore);
    expect(existsSync(jsonPath)).toBe(true);
  });

  it('seeds the administrator bootstrap account and nothing else', async () => {
    vi.stubEnv('STORE_BACKEND', undefined);
    vi.stubEnv('LEISH_DB_PATH', jsonPath);

    const { store } = await import('./data-store.ts');
    const users = await store.getUsers();
    expect(users.map(user => user.email)).toEqual(['shamel@leish.my']);
    expect(users[0].role).toBe('admin');
    expect(users[0].password).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(await store.getUserByEmail('SHAMEL@leish.my')).toMatchObject({ id: 'user-admin-1' });
    expect(await store.getSalons()).toEqual([]);
    expect(await store.getBookings()).toEqual([]);
    expect(await store.getSalonReviews('salon-1')).toEqual([]);
  });
});

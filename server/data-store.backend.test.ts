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
});

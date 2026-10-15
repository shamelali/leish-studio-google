import { describe, it, expect, vi, afterEach } from 'vitest';
import { calcDistanceKm } from './geo.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
});

const matrixOk = (kmValue = 12500, minutesValue = 1500) => ({
  ok: true,
  json: async () => ({
    status: 'OK',
    rows: [{ elements: [{ status: 'OK', distance: { value: kmValue }, duration: { value: minutesValue } }] }],
  }),
});

describe('calcDistanceKm (Google Distance Matrix)', () => {
  it('returns null when no server key is configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await calcDistanceKm('A', 'B')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns kilometres and minutes on an OK response', async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async () => matrixOk()));
    expect(await calcDistanceKm('KLCC', 'Bangsar')).toEqual({ km: 12.5, minutes: 25 });
  });

  it('returns null when the API reports an error status', async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ status: 'REQUEST_DENIED' }) })));
    expect(await calcDistanceKm('A', 'B')).toBeNull();
  });

  it('returns null when the route element is not routable', async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ status: 'OK', rows: [{ elements: [{ status: 'ZERO_RESULTS' }] }] }) })),
    );
    expect(await calcDistanceKm('A', 'B')).toBeNull();
  });

  it('returns null when transport fails', async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await calcDistanceKm('A', 'B')).toBeNull();
  });
});

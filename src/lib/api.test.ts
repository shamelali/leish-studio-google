import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookingsApi } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bookingsApi.updateStatus', () => {
  it('uses the shared authenticated client and throws on non-2xx responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Status update denied' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('test-token') });

    await expect(bookingsApi.updateStatus('booking-1', 'confirmed')).rejects.toThrow('Status update denied');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bookings/booking-1/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'confirmed' }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
      }),
    );
  });
});

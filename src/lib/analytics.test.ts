import { describe, expect, it, vi } from 'vitest';
import { createAnalytics, analytics } from './analytics';

describe('analytics boundary', () => {
  it('uses a no-op default without requiring a provider', () => {
    expect(() => analytics.track('page_view', { tab: 'explore' })).not.toThrow();
  });

  it('drops sensitive fields and bounds free-form values before emitting', () => {
    const sink = vi.fn();
    createAnalytics(sink).track('booking_completed', {
      listing_id: 'salon-1',
      email: 'client@example.com',
      notes: 'private booking note',
      source: 'booking-modal',
      long_value: 'x'.repeat(200),
    });

    expect(sink).toHaveBeenCalledWith({
      name: 'booking_completed',
      properties: {
        listing_id: 'salon-1',
        source: 'booking-modal',
        long_value: 'x'.repeat(120),
      },
    });
  });

  it('swallows sink failures so product flows cannot be interrupted', () => {
    expect(() => createAnalytics(() => { throw new Error('offline'); }).track('page_view')).not.toThrow();
  });
});

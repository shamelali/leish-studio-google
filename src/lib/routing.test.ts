import { describe, expect, it } from 'vitest';
import { pathForRoute, routeFromLocation } from './routing';

describe('minimal URL routing', () => {
  it('round-trips feature tabs', () => {
    const route = routeFromLocation({ pathname: '/image-studio' });
    expect(route).toEqual({ tab: 'image-studio' });
    expect(pathForRoute(route)).toBe('/image-studio');
  });

  it('supports shareable salon detail URLs', () => {
    const route = routeFromLocation({ pathname: '/salon/atelier%2Fone' });
    expect(route).toEqual({ tab: 'explore', salonId: 'atelier/one' });
    expect(pathForRoute(route)).toBe('/salon/atelier%2Fone');
  });

  it('accepts the legacy listing detail alias', () => {
    expect(routeFromLocation({ pathname: '/listing/atelier-one' })).toEqual({
      tab: 'explore',
      salonId: 'atelier-one',
    });
  });

  it.each([
    ['/advisor', { tab: 'ai-stylist' }],
    ['/bookings', { tab: 'client' }],
    ['/portal/client', { tab: 'client' }],
    ['/portal/provider', { tab: 'provider' }],
    ['/portal/admin', { tab: 'admin' }],
  ] as const)('maps %s to its implemented surface', (pathname, expected) => {
    expect(routeFromLocation({ pathname })).toEqual(expected);
  });

  it('falls back to discovery for unknown paths', () => {
    expect(routeFromLocation({ pathname: '/not-a-route' })).toEqual({ tab: 'explore' });
  });
});

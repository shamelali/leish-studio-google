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

  it('falls back to discovery for unknown paths', () => {
    expect(routeFromLocation({ pathname: '/not-a-route' })).toEqual({ tab: 'explore' });
  });
});

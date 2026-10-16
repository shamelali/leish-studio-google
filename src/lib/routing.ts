import type { Salon } from '../types';

export type AppRoute =
  | { tab: 'explore'; salonId?: string }
  | { tab: 'lookbook' | 'ai-stylist' | 'workspace' | 'client' | 'provider' | 'admin' | 'image-studio' | 'video-studio' | 'concierge' };

const TABS = new Set([
  'lookbook',
  'ai-stylist',
  'workspace',
  'client',
  'provider',
  'admin',
  'image-studio',
  'video-studio',
  'concierge',
]);

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Parse the public URL without requiring a router dependency. */
export function routeFromLocation(location: Pick<Location, 'pathname'>): AppRoute {
  const segments = location.pathname.split('/').filter(Boolean).map(decodeSegment);
  if (segments[0] === 'salon' && segments[1]) return { tab: 'explore', salonId: segments[1] };
  if (segments[0] === 'explore') return { tab: 'explore' };
  if (segments[0] && TABS.has(segments[0])) return { tab: segments[0] as Exclude<AppRoute, { tab: 'explore' }>['tab'] };
  return { tab: 'explore' };
}

export function pathForRoute(route: AppRoute): string {
  if (route.tab === 'explore' && route.salonId) return `/salon/${encodeURIComponent(route.salonId)}`;
  return route.tab === 'explore' ? '/' : `/${route.tab}`;
}

export function findSalonByRoute(salons: Salon[], route: AppRoute): Salon | null {
  if (route.tab !== 'explore' || !route.salonId) return null;
  return salons.find((salon) => salon.id === route.salonId) || null;
}

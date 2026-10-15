/**
 * Server-side Google Maps helpers (Distance Matrix).
 * Ported from the leish-monorepo maps service, adapted to zero dependencies
 * (plain fetch) and the v2 server env contract (GOOGLE_MAPS_SERVER_KEY).
 * All functions return null on any failure so callers can fall back to
 * clearly-labelled sample estimates instead of failing the request.
 */

export interface DistanceResult {
  km: number;
  minutes: number;
}

function getKey(): string | null {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  return key && key.trim() ? key.trim() : null;
}

async function fetchJson(url: string, timeoutMs = 6000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Live road distance + drive time between two addresses via the Google
 * Distance Matrix API. Returns null when unconfigured or on any error.
 */
export async function calcDistanceKm(
  origin: string,
  destination: string,
): Promise<DistanceResult | null> {
  const key = getKey();
  if (!key) return null;
  if (!origin.trim() || !destination.trim()) return null;
  const url =
    'https://maps.googleapis.com/maps/api/distancematrix/json' +
    `?origins=${encodeURIComponent(origin.trim())}` +
    `&destinations=${encodeURIComponent(destination.trim())}` +
    `&key=${encodeURIComponent(key)}`;
  const data = await fetchJson(url);
  if (!data || data.status !== 'OK') return null;
  const row = data.rows?.[0]?.elements?.[0];
  if (!row || row.status !== 'OK') return null;
  const km = row.distance?.value / 1000;
  const minutes = row.duration?.value / 60;
  if (!Number.isFinite(km) || !Number.isFinite(minutes)) return null;
  return { km, minutes };
}

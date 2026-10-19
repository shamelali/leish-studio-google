/**
 * Venue travel-estimate route (extracted from server.ts). Live road distance
 * via Google Distance Matrix when GOOGLE_MAPS_SERVER_KEY is configured;
 * otherwise the long-standing deterministic sample so local development and
 * offline environments keep working. The response always states which source
 * produced it (estimateSource: 'live' | 'sample').
 */
import type { Express } from 'express';
import type { Salon } from '../../src/types.ts';
import { calcDistanceKm } from '../geo.ts';
import { serverError } from '../http-utils.ts';
import type { RouteContext } from './context.ts';

const DISTANCE_HASH_MODULO = 39; // produces range 0-38
const BASE_DISTANCE_KM = 7.5; // minimum distance offset
const DRIVE_MINUTES_PER_KM = 1.37; // average drive time factor
const DRIVE_MINUTES_BASE = 8; // fixed overhead (pickup, parking)
const BASE_KIT_FEE = 50; // Mobile sanitation and lighting kit setup
const MILEAGE_FEE_PER_KM = 1.55; // RM per km

export function sampleDistanceKm(venue: string): { distanceKm: number; estimatedDriveMinutes: number } {
  let hash = 0;
  for (let i = 0; i < venue.length; i++) {
    hash = (hash << 5) - hash + venue.charCodeAt(i);
    hash |= 0;
  }
  const distanceKm = Number((Math.abs(hash % DISTANCE_HASH_MODULO) + BASE_DISTANCE_KM).toFixed(1));
  const estimatedDriveMinutes = Math.round(distanceKm * DRIVE_MINUTES_PER_KM + DRIVE_MINUTES_BASE);
  return { distanceKm, estimatedDriveMinutes };
}

export function registerVenueRoutes(app: Express, ctx: RouteContext): void {
  const { store: appStore } = ctx;

  app.post('/api/venue/estimate-travel', async (req, res) => {
    try {
      const { salonId, venue } = req.body;
      if (!venue || !venue.trim()) {
        return res.status(400).json({ error: 'Venue name or address is required.' });
      }
      if (!salonId || !salonId.trim()) {
        return res.status(400).json({ error: 'salonId is required.' });
      }

      const salon: Salon | undefined = await appStore.getSalon(salonId);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }
      const studioAddress = salon.address;

      const live = await calcDistanceKm(studioAddress, venue.trim());
      const { distanceKm, estimatedDriveMinutes } = live
        ? {
            distanceKm: Number(live.km.toFixed(1)),
            estimatedDriveMinutes: Math.round(live.minutes),
          }
        : sampleDistanceKm(venue);
      const estimateSource = live ? 'live' : 'sample';

      const mileageFee = Number((distanceKm * MILEAGE_FEE_PER_KM).toFixed(2));
      const totalTravelFee = Math.round(BASE_KIT_FEE + mileageFee);

      res.json({
        venueName: venue.trim(),
        studioAddress,
        distanceKm,
        estimatedDriveMinutes,
        baseKitFee: BASE_KIT_FEE,
        mileageFee,
        totalTravelFee,
        estimateSource,
        serviceNote: 'Covers on-location pro lighting setup, sanitized mobile artistry trunks, and wedding morning timeline coordination.'
      });
    } catch (error: any) {
      serverError(res, 'Travel calculation failed');
    }
  });
}

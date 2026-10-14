import type { Salon, Service } from '../types';

export type CatalogRecommendation = {
  salonId?: string | null;
  salonName?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
};

export type CatalogResolution =
  | { resolved: true; salon: Salon; service: Service }
  | {
      resolved: false;
      reason: 'salon' | 'service' | 'mismatch';
      message: string;
    };

/**
 * Normalize labels only for an exact catalogue lookup. This deliberately does
 * not use substring or category matching: a recommendation must resolve to the
 * same canonical salon and service that the model named.
 */
export function normalizeCatalogLabel(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function resolveCatalogRecommendation(
  salons: readonly Salon[],
  recommendation: CatalogRecommendation,
): CatalogResolution {
  const salonId = recommendation.salonId?.trim();
  const salon = salonId ? salons.find(candidate => candidate.id === salonId) : undefined;

  if (!salon) {
    return {
      resolved: false,
      reason: 'salon',
      message: 'The recommended studio is no longer in the catalogue. Start a new recommendation to refresh the available studios.',
    };
  }

  if (recommendation.salonName?.trim() && normalizeCatalogLabel(salon.name) !== normalizeCatalogLabel(recommendation.salonName)) {
    return {
      resolved: false,
      reason: 'mismatch',
      message: 'The recommended studio details have changed. Start a new recommendation before booking.',
    };
  }

  const serviceId = recommendation.serviceId?.trim();
  const serviceName = recommendation.serviceName?.trim();
  const serviceById = serviceId
    ? salon.services.find(candidate => candidate.id === serviceId)
    : undefined;

  if (serviceId && !serviceById) {
    return {
      resolved: false,
      reason: 'service',
      message: 'The recommended service is no longer offered by that studio. Start a new recommendation to refresh the catalogue.',
    };
  }

  if (serviceById) {
    // If both identifiers are supplied, require them to describe the same
    // catalogue record. A stale name must never make us book a different one.
    if (serviceName && normalizeCatalogLabel(serviceById.name) !== normalizeCatalogLabel(serviceName)) {
      return {
        resolved: false,
        reason: 'mismatch',
        message: 'The recommended service details have changed. Start a new recommendation before booking.',
      };
    }
    return { resolved: true, salon, service: serviceById };
  }

  if (!serviceName) {
    return {
      resolved: false,
      reason: 'service',
      message: 'This recommendation does not identify a bookable service. Start a new recommendation to refresh the catalogue.',
    };
  }

  const service = salon.services.find(
    candidate => normalizeCatalogLabel(candidate.name) === normalizeCatalogLabel(serviceName),
  );

  if (!service) {
    return {
      resolved: false,
      reason: 'service',
      message: `We could not find “${serviceName}” at the recommended studio. Start a new recommendation to refresh the catalogue.`,
    };
  }

  return { resolved: true, salon, service };
}

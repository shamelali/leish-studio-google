import { describe, expect, it } from 'vitest';
import type { Salon, Service } from '../types';
import { resolveCatalogRecommendation } from './catalog-resolution';

const recommendedService: Service = {
  id: 'service-soft-glam',
  name: 'Signature Soft Glam',
  price: 150,
  duration: 60,
  description: 'A precise soft-glam finish.',
  category: 'soft-glam',
};

const otherService: Service = {
  id: 'service-bridal',
  name: 'Bridal Artistry',
  price: 320,
  duration: 120,
  description: 'A bridal finish.',
  category: 'bridal',
};

const salon: Salon = {
  id: 'salon-recommended',
  name: 'Recommended Studio',
  tagline: 'Soft glam specialists',
  description: '',
  rating: 4.8,
  reviewCount: 12,
  location: 'Kuala Lumpur',
  address: 'Studio address',
  image: '',
  gallery: [],
  category: 'soft-glam',
  services: [recommendedService, otherService],
  staff: [],
  featured: false,
  workingHours: {},
};

describe('AI recommendation catalogue resolution', () => {
  it('resolves a valid recommendation to the canonical salon and service records', () => {
    const result = resolveCatalogRecommendation([salon], {
      salonId: salon.id,
      salonName: salon.name,
      serviceName: '  signature   soft glam ',
    });

    expect(result).toEqual({ resolved: true, salon, service: recommendedService });
  });

  it('does not fall back to another salon when the recommended salon is unknown', () => {
    const result = resolveCatalogRecommendation([salon], {
      salonId: 'salon-no-longer-listed',
      salonName: salon.name,
      serviceName: recommendedService.name,
    });

    expect(result.resolved).toBe(false);
    if ('reason' in result) expect(result.reason).toBe('salon');
  });

  it('does not fall back to the first service when the recommended service is unknown', () => {
    const result = resolveCatalogRecommendation([salon], {
      salonId: salon.id,
      salonName: salon.name,
      serviceName: 'Invented Service',
    });

    expect(result.resolved).toBe(false);
    if ('reason' in result) expect(result.reason).toBe('service');
  });

  it('requires an explicit service name to agree with an explicit canonical service ID', () => {
    const result = resolveCatalogRecommendation([salon], {
      salonId: salon.id,
      salonName: salon.name,
      serviceId: recommendedService.id,
      serviceName: otherService.name,
    });

    expect(result.resolved).toBe(false);
    if ('reason' in result) expect(result.reason).toBe('mismatch');
  });

  it('does not book a valid ID when the displayed studio name disagrees', () => {
    const result = resolveCatalogRecommendation([salon], {
      salonId: salon.id,
      salonName: 'A different studio',
      serviceId: recommendedService.id,
    });

    expect(result.resolved).toBe(false);
    if ('reason' in result) expect(result.reason).toBe('mismatch');
  });
});

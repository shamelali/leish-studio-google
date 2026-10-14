import { describe, expect, it } from 'vitest';
import { buildPageMetadata, buildStructuredData } from './seo';
import type { Salon } from '../types';

const salon = {
  id: 'salon-1',
  name: 'Atelier Leish',
  tagline: 'Editorial glam for every occasion',
  description: 'A verified beauty atelier.',
  rating: 4.8,
  reviewCount: 12,
  location: 'Kuala Lumpur',
  address: '1 Example Street',
  image: 'https://example.test/atelier.jpg',
  gallery: [],
  category: 'editorial',
  services: [],
  staff: [],
  featured: true,
  workingHours: {},
} satisfies Salon;

describe('SEO foundations', () => {
  it('builds a stable canonical title and description for listing pages', () => {
    expect(buildPageMetadata({
      origin: 'https://leish.example/',
      pathname: '/',
      selectedSalon: salon,
    })).toEqual({
      title: 'Atelier Leish | Leish!',
      description: 'Editorial glam for every occasion Explore services, reviews, and booking availability at Atelier Leish in Kuala Lumpur.',
      canonicalUrl: 'https://leish.example/',
    });
  });

  it('emits valid graph nodes without the previous unsupported price aggregate', () => {
    const data = buildStructuredData({
      origin: 'https://leish.example',
      pathname: '/',
      salons: [salon],
    });
    const graph = data['@graph'] as Record<string, unknown>[];
    expect(data['@context']).toBe('https://schema.org');
    expect(graph.some((node) => node['@type'] === 'WebSite')).toBe(true);
    expect(graph.some((node) => node['@type'] === 'Organization')).toBe(true);
    const itemList = graph.find((node) => node['@type'] === 'ItemList');
    expect(itemList).toBeDefined();
    expect(JSON.stringify(data)).not.toContain('AggregateOffer');
    expect(JSON.stringify(data)).not.toContain('USD');
  });

  it('adds rating data only when the catalog has reviews', () => {
    const data = buildStructuredData({
      origin: 'https://leish.example',
      pathname: '/',
      selectedSalon: { ...salon, reviewCount: 0 },
    });
    const listing = (data['@graph'] as Record<string, unknown>[]).find((node) => node['@type'] === 'BeautySalon');
    expect(listing).toBeDefined();
    expect(listing?.aggregateRating).toBeUndefined();
  });

  it('publishes listing services with MYR pricing for search engines', () => {
    const data = buildStructuredData({
      origin: 'https://leish.example',
      pathname: '/salon/salon-1',
      selectedSalon: {
        ...salon,
        services: [{
          id: 'service-1',
          name: 'Editorial Signature',
          price: 280,
          duration: 90,
          description: 'Camera-ready complexion and eye artistry.',
          category: 'editorial',
        }],
      },
    });
    const listing = (data['@graph'] as Record<string, unknown>[]).find((node) => node['@type'] === 'BeautySalon');
    const catalog = listing?.hasOfferCatalog as Record<string, unknown>;
    const offers = catalog.itemListElement as Record<string, unknown>[];
    expect(offers[0]).toMatchObject({ name: 'Editorial Signature', price: 280, priceCurrency: 'MYR' });
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ConciergeArtistCards from './ConciergeArtistCards';
import type { Salon, Service } from '../types';

const service: Service = {
  id: 'bridal', name: 'Dewy Bridal Makeup', price: 450, duration: 90,
  description: 'A soft bridal finish', category: 'bridal',
};
const salon: Salon = {
  id: 'artist', name: 'Catalogue Artist', tagline: 'Bridal artist', description: '',
  rating: 4.8, reviewCount: 12, location: 'Kuala Lumpur', address: 'KL', image: '',
  gallery: [], category: 'bridal', services: [service], staff: [], featured: false,
  workingHours: {}, type: 'mua',
};

describe('concierge booking cards', () => {
  it('renders a search status before results arrive', () => {
    const html = renderToStaticMarkup(React.createElement(ConciergeArtistCards, { state: 'loading' }));
    expect(html).toContain('role="status"');
    expect(html).toContain('Searching real catalogue services');
    expect(html).not.toContain('Book this service');
  });

  it('renders catalogue facts and an explicit booking action, without availability claims', () => {
    const html = renderToStaticMarkup(React.createElement(ConciergeArtistCards, {
      state: 'result', onBook: () => {},
      result: { summary: 'One matching service', artists: [{ salon, service, reason: 'Dewy bridal in KL' }] },
    }));
    for (const text of ['Catalogue Artist', 'Kuala Lumpur', 'Dewy Bridal Makeup', 'RM 450', 'Book this service']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('Image unavailable');
    expect(html).not.toContain('src=""');
    expect(html).not.toContain('Available today');
  });

  it('renders an empty result without a booking button', () => {
    const html = renderToStaticMarkup(React.createElement(ConciergeArtistCards, {
      state: 'result', result: { artists: [], summary: 'Try another locality or budget.' },
    }));
    expect(html).toContain('no exact matches');
    expect(html).toContain('Try another locality or budget.');
    expect(html).not.toContain('Book this service');
  });
});

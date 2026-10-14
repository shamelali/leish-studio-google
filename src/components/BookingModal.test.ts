import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import BookingModal, { BookingReceipt, BookingReview } from './BookingModal';
import type { Booking, Salon, Service } from '../types';
import type { BookingRequest, BookingTravelQuote } from '../lib/booking';

const service: Service = {
  id: 'bridal', name: 'Bridal artistry', description: '', category: 'bridal', price: 450, duration: 90,
};
const salon: Salon = {
  id: 'atelier', name: 'Leish Atelier', tagline: '', description: '', location: 'Kuala Lumpur',
  address: 'Studio address', rating: 4.8, reviewCount: 12, image: '', gallery: [],
  category: 'bridal', services: [service], workingHours: {}, featured: false,
  staff: [{ id: 'artist', name: 'Aisha', role: 'Makeup artist', avatar: '/artist.jpg', rating: 4.8 }],
};
const request: BookingRequest = {
  salonId: salon.id, serviceId: service.id, staffId: 'artist', date: '2026-10-15', time: '10:30 AM',
  clientName: 'Amina', clientEmail: 'amina@example.com', clientPhone: '+60 12-345 6789',
  notes: 'Sensitive skin', isLocationEvent: true, eventVenue: 'Majestic Hotel, Suite 902', travelSurcharge: 50,
  attachedMoodboard: { lookName: 'Soft gold', palette: [], lipFormula: 'Rose', eyeStyle: 'Shimmer' },
};
const booking: Booking = {
  ...request, id: 'request-123', salonName: salon.name, salonAddress: salon.address, serviceName: service.name,
  servicePrice: service.price, serviceDuration: service.duration, staffName: 'Aisha',
  status: 'pending', createdAt: '2026-10-14T10:00:00Z',
};
const noop = () => {};

function renderModal(overrides: Partial<React.ComponentProps<typeof BookingModal>> = {}) {
  return renderToStaticMarkup(React.createElement(QueryClientProvider, { client: new QueryClient() },
    React.createElement(BookingModal, {
      isOpen: true, salon, service, currentUser: null, onClose: noop,
      onBookingSuccess: noop, onOpenAuth: noop, ...overrides,
    }),
  ));
}

describe('booking modal server-rendered semantics', () => {
  it('renders a named, described dialog and date/time choices before any submit action', () => {
    const html = renderModal();
    expect(html).toContain('role="dialog"');
    for (const attribute of ['aria-labelledby', 'aria-describedby']) {
      const referencedId = html.match(new RegExp(`${attribute}="([^"]+)"`))?.[1];
      expect(referencedId).toBeTruthy();
      expect(html).toContain(`id="${referencedId}"`);
    }
    expect(html).toContain('aria-label="Close booking dialog"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('<legend');
    expect(html).toContain('Continue to Details');
    expect(html).not.toContain('type="submit"');
    expect(html).not.toContain('Send booking request');
  });

  it('renders no dialog when closed', () => {
    expect(renderModal({ isOpen: false })).toBe('');
  });

  it('explains unavailable date and specialist choices', () => {
    const html = renderModal({ salon: {
      ...salon, staff: [], workingHours: {
        Monday: 'Closed', Tuesday: 'Closed', Wednesday: 'Closed', Thursday: 'Closed',
        Friday: 'Closed', Saturday: 'Closed', Sunday: 'Closed',
      },
    } });
    expect(html).toContain('No specialists are listed for online booking');
    expect(html).toContain('No appointment dates are listed in the next two weeks');
  });
});

describe('booking review and receipt', () => {
  const reviewProps = {
    request, salon, service, staffName: 'Aisha', travelQuote: null,
    isSubmitting: false, onEdit: noop, onSubmit: noop,
  };

  it('shows the complete request, an edit action, and an explicit final submission action', () => {
    const html = renderToStaticMarkup(React.createElement(BookingReview, reviewProps));
    for (const text of [
      'Leish Atelier', 'Bridal artistry', 'Aisha', 'October 15, 2026', '10:30 AM',
      'Amina', 'amina@example.com', '+60 12-345 6789', 'Majestic Hotel, Suite 902',
      'Sensitive skin', 'Soft gold', 'RM450', 'RM50', 'RM500', 'Edit details', 'Send booking request',
    ]) expect(html).toContain(text);
    expect(html).toContain('type="submit"');
    expect(html).toContain('Sending this request does not confirm a slot');
    expect(html).toContain('Mileage has not been calculated');
    expect(html).not.toContain('disabled=""');
  });

  it('labels sample travel honestly in the final review', () => {
    const travelQuote: BookingTravelQuote = {
      distanceKm: 20, estimatedDriveMinutes: 30, baseKitFee: 50, mileageFee: 31, totalTravelFee: 81,
      estimateSource: 'sample',
    };
    const html = renderToStaticMarkup(React.createElement(BookingReview, {
      ...reviewProps, request: { ...request, travelSurcharge: 81 }, travelQuote,
    }));
    expect(html).toContain('Sample travel estimate, not a live route calculation.');
    expect(html).toContain('RM531');
    expect(html).not.toContain('Mileage has not been calculated');
  });

  it('announces submission and disables both edit and send while pending', () => {
    const html = renderToStaticMarkup(React.createElement(BookingReview, { ...reviewProps, isSubmitting: true }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Sending your booking request. Please wait');
    const buttons: string[] = html.match(/<button\b[^>]*>/g) || [];
    expect(buttons).toHaveLength(2);
    expect(buttons.every(button => button.includes('disabled=""'))).toBe(true);
  });

  it('shows a pending receipt with a readable return CTA and no email promise', () => {
    const html = renderToStaticMarkup(React.createElement(BookingReceipt, { booking, onClose: noop }));
    expect(html).toContain('Booking request received');
    expect(html).toContain('Pending studio confirmation');
    expect(html).toContain('Your appointment is not confirmed yet');
    expect(html).toContain('request-123');
    expect(html).toContain('Contact email');
    expect(html).toContain('amina@example.com');
    expect(html).toContain('RM500');
    expect(html).toContain('Return to browsing');
    const returnButton = html.match(/<button\b[^>]*>/)?.[0] || '';
    expect(returnButton).toContain('bg-primary');
    expect(returnButton).toContain('text-on-primary');
    expect(html).not.toMatch(/Booking Confirmed|ritual is scheduled|Confirmation sent|will be emailed/i);
  });
});

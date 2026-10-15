import { describe, expect, it } from 'vitest';
import {
  bookingFormSchema, bookingTravelQuoteSchema, buildBookingRequest, formatBookingDate,
  getBookingDates, getBookingScheduleErrors, getBookingTravelFee,
  type BookingFormData, type BookingTravelQuote,
} from './booking';
import type { LookbookItem, Salon, Service } from '../types';

const service: Service = {
  id: 'bridal', name: 'Bridal artistry', description: '', category: 'bridal', duration: 90, price: 450,
};
const salon: Salon = {
  id: 'atelier', name: 'Leish Atelier', tagline: '', description: '', location: 'Kuala Lumpur',
  address: 'Studio address', rating: 4.8, reviewCount: 12, image: '', gallery: [],
  category: 'bridal', services: [service], staff: [], workingHours: {}, featured: false,
};
const details: BookingFormData = {
  clientName: '  Amina  ', clientEmail: '  amina@example.com  ', clientPhone: ' +60 12-345 6789 ',
  notes: 'Sensitive skin', isLocationEvent: false, eventVenue: '',
};
const quote: BookingTravelQuote = {
  distanceKm: 20, estimatedDriveMinutes: 30, totalTravelFee: 81, baseKitFee: 50, mileageFee: 31,
  estimateSource: 'sample',
};
const context = { salon, service, staffId: 'artist', date: '2026-10-15', time: '10:30 AM', travelQuote: quote };

describe('booking details validation', () => {
  it('keeps guest booking available and trims contact details', () => {
    expect(bookingFormSchema.parse(details)).toMatchObject({
      clientName: 'Amina', clientEmail: 'amina@example.com', clientPhone: '+60 12-345 6789',
    });
  });

  it('returns field errors for blank contacts and excessive notes', () => {
    const result = bookingFormSchema.safeParse({
      ...details, clientName: '  ', clientEmail: '   ', clientPhone: '\t', notes: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(issue => issue.path[0])).toEqual(
        expect.arrayContaining(['clientName', 'clientEmail', 'clientPhone', 'notes']),
      );
      expect(result.error.issues.every(issue => issue.message.length > 10)).toBe(true);
    }
  });

  it('accepts a demo username as the contact identifier', () => {
    expect(bookingFormSchema.parse({ ...details, clientEmail: 'client' }).clientEmail).toBe('client');
  });

  it.each(['', '   ', 'v'.repeat(201)])('rejects an invalid on-location venue (%s)', eventVenue => {
    const result = bookingFormSchema.safeParse({ ...details, isLocationEvent: true, eventVenue });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(['eventVenue']);
  });

  it('ignores a retained venue when the client switches to an in-studio appointment', () => {
    const request = buildBookingRequest({ ...details, eventVenue: 'v'.repeat(201) }, context);
    expect(request.eventVenue).toBeUndefined();
    expect(request.travelSurcharge).toBe(0);
  });

  it('bounds telephone and email length consistently with the booking API', () => {
    const result = bookingFormSchema.safeParse({
      ...details, clientPhone: '1'.repeat(51), clientEmail: `${'a'.repeat(250)}@example.com`,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(issue => issue.path[0])).toEqual(
      expect.arrayContaining(['clientPhone', 'clientEmail']),
    );
  });
});

describe('booking dates and selections', () => {
  const today = new Date(2026, 9, 14, 0, 30);

  it('uses local calendar dates and excludes Sunday and the studio closed day', () => {
    const dates = getBookingDates({ Friday: 'Closed' }, today);
    expect(dates[0].value).toBe('2026-10-15');
    expect(dates.at(-1)?.value).toBe('2026-10-28');
    expect(dates.map(date => date.value)).not.toContain('2026-10-16');
    expect(dates.map(date => date.day)).not.toContain('Sun');
    expect(formatBookingDate('2026-10-15')).toBe('Thursday, October 15, 2026');
  });

  it('provides visible errors for missing or stale date/time selections', () => {
    expect(getBookingScheduleErrors('', '', {}, today)).toEqual({
      date: 'Choose an appointment date.', time: 'Choose an appointment time.',
    });
    expect(getBookingScheduleErrors('2026-10-14', '00:00', {}, today)).toEqual({
      date: 'Choose a new date from the available options.', time: 'Choose an appointment time.',
    });
    expect(getBookingScheduleErrors('2026-10-15', '10:30 AM', {}, today)).toEqual({ date: undefined, time: undefined });
  });

  it('returns no dates when the studio is closed throughout the window', () => {
    expect(getBookingDates({
      Monday: 'Closed', Tuesday: 'Closed', Wednesday: 'Closed', Thursday: 'Closed',
      Friday: 'Closed', Saturday: 'Closed', Sunday: 'Closed',
    }, today)).toEqual([]);
  });
});

describe('booking review payload and travel estimates', () => {
  it('snapshots valid contact details, venue, and the reviewed travel fee', () => {
    const draft = { ...details, isLocationEvent: true, eventVenue: '  Majestic Hotel, Suite 902  ' };
    const request = buildBookingRequest(draft, context);
    draft.clientName = 'Changed after review';
    expect(request).toMatchObject({
      salonId: 'atelier', serviceId: 'bridal', staffId: 'artist', date: '2026-10-15', time: '10:30 AM',
      clientName: 'Amina', clientEmail: 'amina@example.com', clientPhone: '+60 12-345 6789',
      notes: 'Sensitive skin', eventVenue: 'Majestic Hotel, Suite 902', travelSurcharge: 81,
    });
  });

  it('cannot build a request from invalid contact or venue data', () => {
    expect(() => buildBookingRequest({ ...details, clientName: ' ' }, context)).toThrow();
    expect(() => buildBookingRequest({ ...details, isLocationEvent: true }, context)).toThrow();
  });

  it('retains the compact attached lookbook in the reviewed request', () => {
    const moodboard: LookbookItem = {
      id: 'look', lookName: 'Soft gold', category: 'bridal', vibeDescription: '',
      colorPalette: [{ hex: '#A88F5A', name: 'Gold' }],
      complexion: { finish: 'Dewy', coverage: 'Light', technique: '' },
      eyeArtistry: { style: 'Soft shimmer', lashStyle: '' },
      lipFormula: { shade: 'Rose', finish: 'Satin', liner: '' }, longevityFeatures: [],
    };
    expect(buildBookingRequest(details, { ...context, attachedMoodboard: moodboard }).attachedMoodboard).toEqual({
      lookName: 'Soft gold', palette: moodboard.colorPalette, lipFormula: 'Rose (Satin)', eyeStyle: 'Soft shimmer',
    });
  });

  it('uses a provisional RM50 kit fee without a quote and no fee for in-studio bookings', () => {
    expect(getBookingTravelFee(true, null)).toBe(50);
    expect(getBookingTravelFee(true, quote)).toBe(81);
    expect(getBookingTravelFee(false, quote)).toBe(0);
    expect(getBookingTravelFee(true, { ...quote, totalTravelFee: 0 })).toBe(0);
  });

  it('rejects unusable travel responses and preserves sample provenance', () => {
    expect(bookingTravelQuoteSchema.parse(quote).estimateSource).toBe('sample');
    for (const totalTravelFee of [NaN, Infinity, -1, '81', undefined]) {
      expect(bookingTravelQuoteSchema.safeParse({ ...quote, totalTravelFee }).success).toBe(false);
    }
  });
});

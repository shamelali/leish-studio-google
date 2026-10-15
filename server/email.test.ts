import { describe, it, expect, vi, afterEach } from 'vitest';
import { bookingConfirmationEmail, sendBookingConfirmation } from './email.ts';
import type { Booking } from '../src/types.ts';

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'book-1',
  salonId: 'salon-1',
  salonName: 'Maison Leish',
  salonAddress: 'KL',
  serviceId: 'serv-1',
  serviceName: 'Bridal Glam',
  servicePrice: 320,
  serviceDuration: 90,
  staffId: 'staff-1',
  staffName: 'Aina',
  date: '2026-10-28',
  time: '10:30 AM',
  clientName: 'Amina',
  clientEmail: 'amina@example.com',
  clientPhone: '+60 12-345 6789',
  status: 'confirmed',
  createdAt: '2026-10-16T00:00:00.000Z',
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.BREVO_API_KEY;
});

describe('bookingConfirmationEmail', () => {
  it('renders reference, names, schedule and RM amount in both bodies', () => {
    const { subject, html, text } = bookingConfirmationEmail(booking());
    expect(subject).toContain('book-1');
    for (const body of [html, text]) {
      expect(body).toContain('Amina');
      expect(body).toContain('Bridal Glam');
      expect(body).toContain('2026-10-28');
      expect(body).toContain('RM320');
    }
  });

  it('escapes HTML in customer-controlled fields', () => {
    const { html } = bookingConfirmationEmail(booking({ clientName: '<script>alert(1)</script>' }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('sendBookingConfirmation', () => {
  it('skips silently without a BREVO_API_KEY', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await sendBookingConfirmation(booking())).toEqual({
      sent: false,
      reason: 'BREVO_API_KEY is not configured.',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('skips demo usernames that are not email addresses', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await sendBookingConfirmation(booking({ clientEmail: 'client' }))).toEqual({
      sent: false,
      reason: 'Recipient is not an email address.',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to Brevo and reports success on 2xx', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    const fetchSpy = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchSpy);
    expect(await sendBookingConfirmation(booking())).toEqual({ sent: true });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const calls = fetchSpy.mock.calls as unknown as Array<[string, { body: string }]>;
    const [url, init] = calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(JSON.parse(init.body).to).toEqual([{ email: 'amina@example.com' }]);
  });

  it('reports failure without throwing on transport errors', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
    const result = await sendBookingConfirmation(booking());
    expect(result.sent).toBe(false);
  });
});

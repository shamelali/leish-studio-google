/**
 * Transactional email via Brevo's REST API (plain fetch, no SDK dependency).
 * Adapted from the leish-monorepo email service and the
 * dutaintegra_homepage send-email function.
 *
 * Sending is best-effort by design: missing BREVO_API_KEY, a non-email
 * recipient (e.g. the `client` / `studio` demo usernames), or any transport
 * failure resolves { sent: false } instead of throwing, so booking flows
 * never fail because of email. Callers must still never let an email error
 * fail the request they are serving.
 */
import type { Booking } from '../src/types.ts';

export interface EmailResult {
  sent: boolean;
  reason?: string;
}

function isEmailAddress(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function bookingConfirmationEmail(booking: Booking): { subject: string; html: string; text: string } {
  const subject = `Booking Confirmed — ${booking.id}`;
  const amount = `RM${booking.servicePrice}`;
  const text =
    `Hi ${booking.clientName},\n\n` +
    `Your appointment at ${booking.salonName} is confirmed.\n\n` +
    `Reference: ${booking.id}\n` +
    `Service: ${booking.serviceName}\n` +
    `Studio: ${booking.salonName}\n` +
    `Date: ${booking.date}\n` +
    `Time: ${booking.time}\n` +
    `Amount: ${amount}\n\n` +
    `The studio will contact you at ${booking.clientEmail} if anything changes. — Leish!`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Booking Confirmation</title>` +
    `<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}` +
    `.header{background:#1a1a1a;color:#fff;padding:28px;text-align:center}` +
    `.details{background:#fff;padding:20px;margin:20px 0;border-left:4px solid #c9a96e}` +
    `.row{display:flex;justify-content:space-between;margin:8px 0;padding:8px 0;border-bottom:1px solid #eee}` +
    `.footer{text-align:center;color:#666;font-size:12px;margin-top:28px}</style></head><body>` +
    `<div class="header"><h1>Booking Confirmed</h1><p>Your appointment is all set!</p></div>` +
    `<p>Hi ${escapeHtml(booking.clientName)},</p>` +
    `<p>Thank you for booking with Leish! Your appointment has been confirmed.</p>` +
    `<div class="details"><h3>Booking Details</h3>` +
    `<div class="row"><span>Reference:</span><strong>${escapeHtml(booking.id)}</strong></div>` +
    `<div class="row"><span>Service:</span><strong>${escapeHtml(booking.serviceName)}</strong></div>` +
    `<div class="row"><span>Studio:</span><strong>${escapeHtml(booking.salonName)}</strong></div>` +
    `<div class="row"><span>Date:</span><strong>${escapeHtml(booking.date)}</strong></div>` +
    `<div class="row"><span>Time:</span><strong>${escapeHtml(booking.time)}</strong></div>` +
    `<div class="row"><span>Amount:</span><strong>${escapeHtml(amount)}</strong></div></div>` +
    `<div class="footer">The studio will contact you at ${escapeHtml(booking.clientEmail)} if anything changes. — Leish!</div>` +
    `</body></html>`;
  return { subject, html, text };
}

/**
 * Send the confirmation email for a confirmed booking. Never throws.
 */
export async function sendBookingConfirmation(booking: Booking): Promise<EmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { sent: false, reason: 'BREVO_API_KEY is not configured.' };
  if (!isEmailAddress(booking.clientEmail)) {
    return { sent: false, reason: 'Recipient is not an email address.' };
  }
  const fromEmail = process.env.FROM_EMAIL || 'hello@leish.studio';
  const fromName = process.env.FROM_NAME || 'Leish!';
  const { subject, html, text } = bookingConfirmationEmail(booking);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: booking.clientEmail.trim() }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { sent: false, reason: `Brevo responded ${res.status}.` };
    return { sent: true };
  } catch {
    return { sent: false, reason: 'Email transport failed.' };
  } finally {
    clearTimeout(timer);
  }
}

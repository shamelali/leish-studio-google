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

/** Shared email-shape guard (guest contact verification, G2). */
export { isEmailAddress };

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
 * Send the verification code for guest contact verification (FR-001/G1).
 * Unlike confirmation email this is NOT best-effort: the caller turns a
 * failed send into 503 verification_unavailable, because a verification
 * that can silently fail is no verification (TD-5).
 */
export async function sendVerificationCode(contact: string, code: string): Promise<EmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { sent: false, reason: 'BREVO_API_KEY is not configured.' };
  if (!isEmailAddress(contact)) {
    return { sent: false, reason: 'Recipient is not an email address.' };
  }
  const fromEmail = process.env.FROM_EMAIL || 'hello@leish.studio';
  const fromName = process.env.FROM_NAME || 'Leish!';
  const subject = `Your Leish! verification code: ${code}`;
  const text =
    `Your Leish! verification code is ${code}.\n\n` +
    `It expires in 10 minutes. Enter it in the booking form to confirm your email address. ` +
    `If you did not request this, ignore this email.`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Leish! verification code</title>` +
    `<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}` +
    `.header{background:#1a1a1a;color:#fff;padding:28px;text-align:center}` +
    `.code{font-size:32px;letter-spacing:8px;text-align:center;padding:20px;margin:20px 0;background:#f5f0e6;color:#1a150f;border-radius:8px}` +
    `.footer{text-align:center;color:#666;font-size:12px;margin-top:28px}</style></head><body>` +
    `<div class="header"><h1>Verify your email</h1></div>` +
    `<p>Enter this code in the Leish! booking form to confirm your email address:</p>` +
    `<div class="code">${escapeHtml(code)}</div>` +
    `<p>The code expires in 10 minutes. If you did not request it, you can safely ignore this email.</p>` +
    `<div class="footer">— Leish!</div></body></html>`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: contact.trim() }],
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

import { test, expect } from '@playwright/test';

test.describe('Guest Email OTP Verification', () => {
  test('verify-request endpoint returns 202 for valid email', async ({ page }) => {
    const response = await page.request.post('/api/bookings/verify-request', {
      data: {
        contact: `test-${Date.now()}@leish.test`,
      },
    });
    expect(response.status()).toBe(202);
    
    const body = await response.json();
    expect(body.message).toContain('Verification code sent');
  });

  test('verify-request rejects non-email contacts', async ({ page }) => {
    const response = await page.request.post('/api/bookings/verify-request', {
      data: {
        contact: 'not-an-email',
      },
    });
    expect(response.status()).toBe(422);
    
    const body = await response.json();
    expect(body.code).toBe('invalid_contact');
  });

  test('verify-request rejects empty contact', async ({ page }) => {
    const response = await page.request.post('/api/bookings/verify-request', {
      data: {
        contact: '',
      },
    });
    expect(response.status()).toBe(400);
  });
});

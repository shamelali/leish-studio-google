import { test, expect } from '@playwright/test';

const DEEP_LINKS = [
  '/',
  '/lookbook',
  '/ai-stylist',
  '/advisor',
  '/bookings',
  '/client',
  '/provider',
  '/image-studio',
  '/video-studio',
  '/concierge',
  '/portal/client',
  '/portal/provider',
  '/listing/salon-1',
];

test.describe('deep-link shell', () => {
  for (const path of DEEP_LINKS) {
    test(`${path} returns the application shell`, async ({ page }) => {
      const response = await page.goto(path);

      expect(response?.status()).toBe(200);
      await expect(page.locator('body')).toContainText('Leish!');
    });
  }
});

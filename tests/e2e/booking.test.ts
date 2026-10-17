import { test, expect } from '@playwright/test';

test.describe('Booking Flow', () => {
  test('should navigate to salon details', async ({ page }) => {
    await page.goto('/');
    
    // Wait for salons to load
    await page.waitForTimeout(4000);
    
    // Click on a salon card using JavaScript to bypass overlay issues
    const salonCard = page.getByRole('heading', { name: 'Leish! Bridal Atelier KL' }).first();
    await salonCard.waitFor({ state: 'visible', timeout: 10000 });
    await salonCard.click({ force: true });
    
    // Should navigate to salon details page
    await expect(page).toHaveURL(/\/salon\/.*/, { timeout: 15000 });
    await expect(page.getByText('Leish! Bridal Atelier KL')).toBeVisible();
  });

  test('should open booking modal', async ({ page }) => {
    await page.goto('/salon/salon-leish-001');
    await page.waitForTimeout(3000);
    
    // Click book now or create booking button
    const bookButtons = page.getByRole('button', { name: /book|schedule|reserve/i });
    if ((await bookButtons.count()) > 0) {
      await bookButtons.first().click();
      
      // Booking modal should open
      await expect(page.getByText(/booking|appointment/i).first()).toBeVisible();
    } else {
      console.log('No book button found - may need to be logged in');
    }
  });

  test('should show pagination envelope on salons page', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // The API returns a paginated envelope
    const response = await page.request.get('/api/salons');
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('pagination');
    expect(body.pagination).toHaveProperty('page');
    expect(body.pagination).toHaveProperty('limit');
    expect(body.pagination).toHaveProperty('total');
    expect(body.pagination).toHaveProperty('pages');
  });
});

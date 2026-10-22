import { test, expect, type Page } from '@playwright/test';

interface E2ESalon {
  id: string;
  name: string;
}

async function getFirstSalon(page: Page): Promise<E2ESalon> {
  const response = await page.request.get('/api/salons');
  expect(response.status()).toBe(200);
  const body = await response.json() as { data?: E2ESalon[] };
  expect(body.data?.length ?? 0).toBeGreaterThan(0);
  return body.data![0];
}

test.describe('Booking Flow', () => {
  test('should navigate to salon details', async ({ page }) => {
    await page.goto('/');

    const salon = await getFirstSalon(page);
    await expect(page.getByRole('button', { name: `View ${salon.name}` })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: `View ${salon.name}` }).click();

    await expect(page).toHaveURL(new RegExp(`/salon/${salon.id}$`));
    await expect(page.getByRole('heading', { name: salon.name, exact: true })).toBeVisible();
  });

  test('should open booking modal', async ({ page }) => {
    const salon = await getFirstSalon(page);
    await page.goto(`/salon/${encodeURIComponent(salon.id)}`);
    await expect(page.getByRole('heading', { name: salon.name, exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Reserve Slot', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Date & time', exact: true })).toBeVisible();
  });

  test('should show pagination envelope on salons page', async ({ page }) => {
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

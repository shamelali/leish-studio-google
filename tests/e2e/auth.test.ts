import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should load the landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Leish/);
    await expect(page.getByRole('heading', { name: /Couture Makeup/ })).toBeVisible();
  });

  test('should open auth modal and show register form', async ({ page }) => {
    await page.goto('/');
    // Click "Get started" or sign up button
    await page.getByRole('button', { name: /get started/i }).first().click();
    await expect(page.getByText(/I want to join as/i)).toBeVisible();
  });

  test('should fill out registration form', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.getByRole('button', { name: /get started/i }).first().click();
    
    // Wait for role picker to appear
    await page.getByText('Makeup Client').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByText('Makeup Client').click();
    
    // Fill in registration details
    await page.getByPlaceholder(/Camille Laurent/i).fill('Test User');
    const emailSuffix = `${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.retry}`
      .replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase();
    await page.getByPlaceholder(/name@example.com/i).fill(`playwright-${emailSuffix}@leish.test`);
    await page.getByPlaceholder(/••••••••/i).fill('TestPass123!');
    
    // Wait for submit button to be enabled (form validation)
    await expect(page.getByRole('button', { name: /create my account/i })).toBeEnabled({ timeout: 10000 });
    
    // Submit registration
    await page.getByRole('button', { name: /create my account/i }).click();

    await expect(page.getByText(/account created successfully/i)).toBeVisible({ timeout: 10000 });
  });

  test('should show login form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await expect(page.getByPlaceholder(/name@example.com/i)).toBeVisible();
    await expect(page.getByPlaceholder(/••••••••/i)).toBeVisible();
  });
});

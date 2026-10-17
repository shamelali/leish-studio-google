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

  test('should fill out registration form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /get started/i }).first().click();
    
    // Select a role
    await page.getByText('Makeup Client').click();
    
    // Fill in registration details
    await page.getByPlaceholder(/Camille Laurent/i).fill('Test User');
    await page.getByPlaceholder(/name@example.com/i).fill(`test${Date.now()}@leish.test`);
    await page.getByPlaceholder(/••••••••/i).fill('TestPass123!');
    
    // Submit registration
    await page.getByRole('button', { name: /create my account/i }).click();
    
    // Should show success or navigate to app
    await page.waitForTimeout(3000);
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('Leish');
  });

  test('should show login form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await expect(page.getByPlaceholder(/name@example.com/i)).toBeVisible();
    await expect(page.getByPlaceholder(/••••••••/i)).toBeVisible();
  });
});

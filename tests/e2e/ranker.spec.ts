import { expect, test } from '@playwright/test';

test('shows the ranker as the first screen', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'OSRS Music Ranker' })).toBeVisible();
  await expect(page.getByLabel('Current matchup')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prefer A' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Too close / Tie' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Prefer B' })).toBeDisabled();
  await expect(page.getByRole('table')).toBeVisible();
});

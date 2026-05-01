import { expect, test } from '@playwright/test';

test('shows the ranker as the first screen', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'OSRS Music Ranker' })).toBeVisible();
  await expect(page.getByLabel('Current matchup')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prefer A' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Too close / Tie' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Prefer B' })).toBeEnabled();
  await expect(page.getByRole('table')).toBeVisible();
});

test('can switch to jukebox mode', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Jukebox' }).click();

  await expect(page.getByLabel('Jukebox')).toBeVisible();
  await expect(page.getByLabel('Top tracks')).toHaveValue('0');
  await expect(page.getByText('Music data snapshot from the OSRS Wiki')).toBeVisible();
});

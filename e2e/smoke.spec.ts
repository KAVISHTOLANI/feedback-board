import { expect, test } from '@playwright/test';
import { checkMobile, snap } from './helpers';

test('log, triage, merge, prioritise', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Hear every signal');
  await expect(page.locator('.hero .matrix svg')).toBeVisible();
  await page.waitForTimeout(1000);
  await snap(page, 'landing');
  await checkMobile(page, 'landing-mobile');

  await page.getByRole('link', { name: 'Open the inbox' }).click();
  await page.getByLabel('Title').fill('Bulk edit for tags');
  await page.getByLabel('Category').selectOption('Feature request');
  await page.getByLabel('Quote').fill('Editing tags one at a time takes forever.');
  await page.getByRole('button', { name: 'Log as new item' }).click();
  await expect(page.getByText('Logged “Bulk edit for tags”.')).toBeVisible();
  await snap(page, 'inbox');
  await checkMobile(page);

  await page.getByRole('link', { name: 'Bulk edit for tags' }).click();
  await page.getByLabel('Reach').fill('600');
  await page.getByLabel('Impact').selectOption('2');
  await page.getByLabel('Effort').fill('1');
  await page.getByRole('button', { name: 'Save score' }).click();
  await expect(page.getByText(/Scored — RICE 960/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Status')).toHaveValue('Triaged');

  await page.goto('./#/item/demo-csv');
  await page.getByRole('button', { name: 'Merge into this' }).first().click();
  await expect(page.getByText(/Merged — now 4 mentions/)).toBeVisible();
  await snap(page, 'detail');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Board' }).click();
  await snap(page, 'board');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Priorities' }).click();
  await expect(page.getByRole('table')).toContainText('Bulk edit for tags');
  await page.waitForTimeout(800);
  await snap(page, 'priorities');
  await checkMobile(page, 'priorities-mobile');
});

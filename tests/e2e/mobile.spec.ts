// Phone-width behaviour (docs/ANIMATION_PLAN.md Phase 4): the product cards and Compare runs become
// swipe carousels below 768 px. Same real browser and API as the main journeys.
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const stage = (page: Page, name: RegExp) => page.getByRole('button', { name }).first().click();

async function startJourney(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue without an account' }).click();
}

async function runSimulation(page: Page) {
  await page.getByRole('button', { name: /Run simulation/ }).click();
  await expect(page.getByRole('button', { name: /Run simulation/ })).toBeEnabled({
    timeout: 30_000,
  });
}

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('the three products are a swipe carousel on a phone, and picking one still works', async ({
  page,
}) => {
  await startJourney(page);
  await stage(page, /2\. Structure/);

  const group = page.getByRole('radiogroup', { name: 'Product' });
  await expect(group.locator('.swiper')).toBeVisible();
  await expect(group.getByRole('radio')).toHaveCount(3);
  await expect(group.getByRole('radio', { name: /ELN/ })).toHaveAttribute('aria-checked', 'true');

  await group.getByRole('radio', { name: /DCD/ }).click();
  await expect(group.getByRole('radio', { name: /DCD/ })).toHaveAttribute('aria-checked', 'true');
  await expect(group.getByRole('radio', { name: /ELN/ })).toHaveAttribute('aria-checked', 'false');
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('the home page journey is a swipe carousel on a phone and the page does not overflow', async ({
  page,
}) => {
  await page.goto('/');
  const journey = page.locator('section#journey');
  await journey.scrollIntoViewIfNeeded();
  await expect(journey.locator('.swiper')).toBeVisible();
  await expect(journey.getByRole('article')).toHaveCount(5);
  await expect(journey.getByRole('article', { name: /Stage 1 of 5: Mandate/ })).toBeAttached();
  await expect(journey.getByRole('article', { name: /Stage 5 of 5: Verdict/ })).toBeAttached();
  // No pinned track on a phone: the section is as tall as its content, not several screens.
  const height = (await journey.boundingBox())?.height ?? 99999;
  expect(height).toBeLessThan(900);
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('compare runs shows one card per run in a carousel instead of a table', async ({ page }) => {
  await startJourney(page);
  await stage(page, /3\. Simulate/);
  await page.getByLabel(/Starting level \(S/).fill('25000');
  await runSimulation(page);
  await stage(page, /3\. Simulate/);
  await page.getByLabel('Custom shock (%)').fill('15');
  await runSimulation(page);

  await page.getByRole('button', { name: /^Runs/ }).click();
  await page.getByRole('checkbox', { name: 'Compare run-1' }).check();
  await page.getByRole('checkbox', { name: 'Compare run-2' }).check();
  await page.getByRole('button', { name: /Compare \(2\)/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Compare 2 runs' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('table')).toHaveCount(0);
  await expect(dialog.locator('.swiper')).toBeVisible();
  await expect(dialog.getByRole('article', { name: 'Run run-1' })).toBeAttached();
  await expect(dialog.getByRole('article', { name: 'Run run-2' })).toBeAttached();
  // Both runs' backend figures are present, and the honesty notes still show.
  await expect(dialog.getByText('-10.0% shock')).toBeAttached();
  await expect(dialog.getByText('+15.0% shock')).toBeAttached();
  await expect(dialog.getByText('The Mode B runs use different shocks.')).toBeVisible();
  await expect(dialog.getByText(/does not rank the products or recommend one/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});

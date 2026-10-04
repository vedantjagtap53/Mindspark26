// The RM journey in a real browser against the real API (TESTING_STRATEGY.md "E2E"): dashboard →
// product → terms → client profile → mode → results → suitability → explanation → chat.
import { expect, test, type Page } from '@playwright/test';

const stage = (page: Page, name: RegExp) => page.getByRole('button', { name }).first().click();

async function runSimulation(page: Page) {
  await page.getByRole('button', { name: /Run simulation/ }).click();
  await expect(page.getByRole('button', { name: /Run simulation/ })).toBeEnabled({
    timeout: 30_000,
  });
}

test('ELN Mode B: payoff, scenarios, verdict, explanation and chat', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Capture the client mandate/ })).toBeVisible();

  await stage(page, /3\. Simulate/);
  await page.getByLabel(/Starting level \(S/).fill('25000');
  await runSimulation(page);

  await stage(page, /4\. Payoffs/);
  await expect(page.getByRole('table', { name: /scenario shock/ })).toBeVisible();
  await expect(page.getByText(/Breakeven/).first()).toBeVisible();

  await stage(page, /5\. Verdict/);
  await expect(
    page.getByText(/Not recorded: the database is not configured|Recorded in the audit database/),
  ).toBeVisible();
  await page.getByRole('button', { name: /Generate explanation/ }).click();
  await expect(page.getByText('E2E stub explanation for a ELN.')).toBeVisible();

  await page.getByLabel('Question').fill('What happens below the barrier?');
  await page.getByRole('button', { name: /Ask/ }).click();
  await expect(page.getByText('Stub answer to: What happens below the barrier?')).toBeVisible();
});

test('ELN Mode A: fan chart with price history, risk panel, model card and payoff curve', async ({
  page,
}) => {
  await page.goto('/');
  await stage(page, /3\. Simulate/);
  await page.getByRole('radio', { name: /Mode A/ }).click();
  await runSimulation(page);

  await stage(page, /4\. Payoffs/);
  await expect(page.getByText(/5th–95th percentile range/)).toBeVisible();
  await expect(page.getByTestId('fan-history')).toBeAttached();
  await expect(page.getByText(/Grey line: daily closes from Yahoo Finance/)).toBeVisible();
  await expect(page.getByRole('table', { name: /Low, base and high case outcomes/ })).toBeVisible();
  await expect(page.getByRole('table', { name: /scenario shock/ })).toBeVisible();
  await expect(page.getByText(/How the forecast was made/)).toBeVisible();
});

test('DCD Mode A: FX forecast through the DCD engine', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'DCD' }).first().click();
  await stage(page, /3\. Simulate/);
  await page.getByRole('radio', { name: /Mode A/ }).click();
  await runSimulation(page);

  await stage(page, /4\. Payoffs/);
  await expect(page.getByText(/USD\/INR: 5th–95th percentile range/)).toBeVisible();
  await expect(page.getByRole('table', { name: /Low, base and high case outcomes/ })).toBeVisible();
  await expect(page.getByText('Strike 84.5').first()).toBeAttached();
});

test.describe('saved client profiles', () => {
  test.skip(!process.env.DATA_CONNECT_EMULATOR_HOST, 'needs the SQL Connect emulator');

  test('save, load and link a profile to the recorded verdict', async ({ page }) => {
    const ref = `E2E-${Date.now()}`;
    await page.goto('/');
    await page.getByLabel('Client reference').fill(ref);
    await page.getByLabel('Profile label').fill('Browser test');
    await page.getByRole('button', { name: /^Save profile/ }).click();
    await expect(page.getByText(`Saved ${ref}.`)).toBeVisible();

    await page.reload();
    const select = page.getByLabel('Saved profile');
    await select.selectOption({ label: `${ref} · Browser test` });
    await page.getByRole('button', { name: /Load saved profile/ }).click();
    await expect(page.getByLabel('Client reference')).toHaveValue(ref);

    await stage(page, /3\. Simulate/);
    await page.getByLabel(/Starting level \(S/).fill('25000');
    await runSimulation(page);
    await stage(page, /5\. Verdict/);
    await expect(page.getByText('Recorded in the audit database with this profile.')).toBeVisible();
  });
});

test('saved profiles report a missing database clearly', async ({ page }) => {
  test.skip(!!process.env.DATA_CONNECT_EMULATOR_HOST, 'database is configured');
  await page.goto('/');
  await expect(
    page.getByText(/Saved profiles unavailable \(DATABASE_NOT_CONFIGURED\)/),
  ).toBeVisible();
});

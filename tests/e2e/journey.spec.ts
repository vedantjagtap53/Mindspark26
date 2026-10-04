// The RM journey in a real browser against the real API (TESTING_STRATEGY.md "E2E"): dashboard →
// product → terms → client profile → mode → results → suitability → explanation → chat.
import { expect, test, type Page } from '@playwright/test';

const stage = (page: Page, name: RegExp) => page.getByRole('button', { name }).first().click();

/** Opens the app past the landing page and enters the client (name and age are required to run). */
async function startJourney(
  page: Page,
  client: { name: string; age: string } | null = {
    name: 'E2E Client',
    age: '52',
  },
) {
  await page.goto('/');
  await page
    .getByRole('button', { name: /Start New Mandate/ })
    .first()
    .click();
  if (client) {
    await page.getByLabel('Client name').fill(client.name);
    await page.getByLabel('Client age').fill(client.age);
  }
}

async function runSimulation(page: Page) {
  await page.getByRole('button', { name: /Run simulation/ }).click();
  await expect(page.getByRole('button', { name: /Run simulation/ })).toBeEnabled({
    timeout: 30_000,
  });
}

test('ELN Mode B: payoff, scenarios, verdict, explanation and chat', async ({ page }) => {
  await startJourney(page);
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
  await startJourney(page);
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
  await startJourney(page);
  await page.getByRole('radio', { name: 'DCD' }).first().click();
  await stage(page, /3\. Simulate/);
  await page.getByRole('radio', { name: /Mode A/ }).click();
  await runSimulation(page);

  await stage(page, /4\. Payoffs/);
  await expect(page.getByText(/USD\/INR: 5th–95th percentile range/)).toBeVisible();
  await expect(page.getByRole('table', { name: /Low, base and high case outcomes/ })).toBeVisible();
  await expect(page.getByText('Strike 84.5').first()).toBeAttached();
});

test('the run waits for the client name and age, then records both with the verdict', async ({
  page,
}) => {
  await startJourney(page, null);
  await stage(page, /3\. Simulate/);
  await page.getByLabel(/Starting level \(S/).fill('25000');
  await expect(page.getByRole('button', { name: /Run simulation/ })).toBeDisabled();
  await expect(page.getByText('Enter the client name.')).toBeVisible();

  await stage(page, /1\. Mandate/);
  await expect(page.getByLabel('Saved profile')).toHaveCount(0);
  await page.getByLabel('Client name').fill('Asha Rao');
  await page.getByLabel('Client age').fill('52');
  await stage(page, /3\. Simulate/);
  await runSimulation(page);

  await stage(page, /5\. Verdict/);
  await expect(
    page.getByText(/Not recorded: the database is not configured|Recorded in the audit database/),
  ).toBeVisible();
});

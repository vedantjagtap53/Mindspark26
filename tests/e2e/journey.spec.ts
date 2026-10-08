// The RM journey in a real browser against the real API (TESTING_STRATEGY.md "E2E"): dashboard →
// product → terms → client profile → mode → results → suitability → explanation → chat.
import { expect, test, type Page } from '@playwright/test';

const stage = (page: Page, name: RegExp) => page.getByRole('button', { name }).first().click();

/**
 * Opens the app past the home page. These tests run against an API that does not enforce sign-in,
 * so the home page offers "Continue without an account"; there is no client name or age to enter.
 */
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

test('DCD Mode A: the Nifty 50 forecast as context only, payoff and verdict stay in Mode B', async ({
  page,
}) => {
  await startJourney(page);
  await stage(page, /2\. Structure/);
  await page.getByRole('radio', { name: 'DCD' }).first().click();
  await stage(page, /3\. Simulate/);
  await page.getByRole('radio', { name: /Mode A/ }).click();
  await runSimulation(page);

  await expect(page.getByText('Mode A forecast · context only')).toBeVisible();
  await expect(page.getByText('Nifty 50: 5th–95th percentile range')).toBeVisible();
  await expect(page.getByRole('note')).toContainText('context only');
  await expect(page.getByText(/How the forecast was made/)).toBeVisible();
  // Not a run: no payoff result is listed.
  await expect(page.getByText('Result', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: /Switch to Mode B for the DCD payoff/ }).click();
  await expect(page.getByRole('radio', { name: /Mode B/ })).toBeChecked();
});

test('DCD Mode B: the run executes and the Payoffs tab shows the FX scenarios', async ({
  page,
}) => {
  await startJourney(page);
  await stage(page, /2\. Structure/);
  await page.getByRole('radio', { name: 'DCD' }).first().click();
  await stage(page, /3\. Simulate/);
  await expect(page.getByRole('radio', { name: /Mode B/ })).toBeChecked();
  await expect(page.getByRole('button', { name: /Run simulation/ })).toBeEnabled();
  await runSimulation(page);

  await stage(page, /4\. Payoffs/);
  const table = page.getByRole('table', { name: /scenario shock/ });
  await expect(table).toBeVisible();
  // What is paid, next to its deposit-currency equivalent.
  await expect(table.getByRole('columnheader', { name: 'Paid as' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Payoff (USD equivalent)' })).toBeVisible();
  await expect(table.getByText('converted at strike').first()).toBeVisible();
  await expect(page.getByText(/Breakeven/).first()).toBeVisible();
});

test('compare: two runs from the session side by side, with the difference flagged', async ({
  page,
}) => {
  await startJourney(page);
  await stage(page, /3\. Simulate/);
  await page.getByLabel(/Starting level \(S/).fill('25000');
  await runSimulation(page);
  await stage(page, /3\. Simulate/);
  await page.getByLabel('Custom shock (%)').fill('15');
  await runSimulation(page);

  await page.getByRole('button', { name: /^Runs/ }).click();
  await expect(page.getByRole('button', { name: /Compare \(0\)/ })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Compare run-1' }).check();
  await page.getByRole('checkbox', { name: 'Compare run-2' }).check();
  await page.getByRole('button', { name: /Compare \(2\)/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Compare 2 runs' });
  await expect(dialog).toBeVisible();
  const table = dialog.getByRole('table', { name: 'Selected runs side by side' });
  await expect(table.getByRole('columnheader', { name: /run-1/ })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: /run-2/ })).toBeVisible();
  await expect(table.getByText('-10.0% shock')).toBeVisible();
  await expect(table.getByText('+15.0% shock')).toBeVisible();
  await expect(dialog.getByText('The Mode B runs use different shocks.')).toBeVisible();
  await expect(dialog.getByText(/does not rank the products or recommend one/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});

test('saved run: a new account runs a simulation and opens its stored record', async ({ page }) => {
  test.skip(!process.env.SUPABASE_TEST_URL, 'needs the local Supabase (SUPABASE_TEST_URL)');
  // A fresh account each time, so earlier runs never show up in this one's list.
  const email = `e2e-${Date.now()}@bank.test`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account' }).first().click();
  await page.getByLabel('Full name').fill('Esha Test');
  await page.getByLabel('Email id').fill(email);
  await page.getByLabel('Password').fill('E2e-Journey-Passw0rd');
  await page.getByRole('button', { name: 'Create account' }).last().click();
  await expect(page.getByRole('heading', { name: /Capture the client mandate/ })).toBeVisible();

  await stage(page, /3\. Simulate/);
  await page.getByLabel(/Starting level \(S/).fill('25000');
  await runSimulation(page);
  await stage(page, /5\. Verdict/);
  await expect(page.getByText(/Recorded in the audit database/)).toBeVisible();

  await page.getByRole('button', { name: /^Runs/ }).click();
  await page.getByRole('radio', { name: 'Saved' }).click();
  const list = page.getByRole('table', { name: /Your saved runs/ });
  await expect(list.getByRole('row')).toHaveCount(2); // header and this account's one run
  await list.getByRole('button', { name: /Open the ELN run/ }).click();

  const record = page.getByRole('dialog', { name: 'Saved run record' });
  await expect(record.getByRole('heading', { name: 'Saved run record' })).toBeVisible();
  await expect(record.getByText(/^VERDICT: /)).toBeVisible();
  await expect(record.getByText(/^Rules version /)).toBeVisible();
  await expect(record.getByRole('table', { name: 'Stored results for each case' })).toContainText(
    'Shock',
  );
  await expect(record.getByRole('button', { name: 'Print / save as PDF' })).toBeEnabled();
  // Escape closes the record and leaves the Runs window open under it.
  await page.keyboard.press('Escape');
  await expect(record).toHaveCount(0);
  await expect(list).toBeVisible();
});

test('the run needs no client name or age, and records the verdict', async ({ page }) => {
  await startJourney(page);
  await expect(page.getByLabel('Client name')).toHaveCount(0);
  await expect(page.getByLabel('Client age')).toHaveCount(0);
  await expect(page.getByLabel('Saved profile')).toHaveCount(0);
  await stage(page, /3\. Simulate/);
  await page.getByLabel(/Starting level \(S/).fill('25000');
  await expect(page.getByRole('button', { name: /Run simulation/ })).toBeEnabled();
  await runSimulation(page);

  await stage(page, /5\. Verdict/);
  await expect(
    page.getByText(/Not recorded: the database is not configured|Recorded in the audit database/),
  ).toBeVisible();
});

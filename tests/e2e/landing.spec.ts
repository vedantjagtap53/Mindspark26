// The landing page in a real browser (docs/ANIMATION_PLAN.md phases 5 and 6): smooth scrolling is on
// here and only here, the header docks, in-page links and the keyboard still work.
import { expect, test, type Page } from '@playwright/test';

const html = (page: Page) => page.locator('html');
const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

test('the home page scrolls smoothly, docks its header, and its links reach their sections', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Smooth scrolling is on for this page, and the header starts relaxed.
  await expect(html(page)).toHaveClass(/lenis/);
  const header = page.locator('header').first();
  await expect(header).toHaveAttribute('data-docked', 'false');

  // Scrolling down docks it.
  await page.mouse.wheel(0, 800);
  await expect(header).toHaveAttribute('data-docked', 'true');

  // An in-page link smooth-scrolls its section to the top of the viewport.
  await page
    .getByRole('navigation', { name: 'On this page' })
    .getByRole('link', { name: 'Products' })
    .click();
  const products = page.locator('section#products');
  await expect
    .poll(async () => Math.round((await products.boundingBox())?.y ?? 9999), { timeout: 5000 })
    .toBeLessThan(120);

  // Keyboard scrolling is not trapped.
  const before = await scrollY(page);
  await page.keyboard.press('PageDown');
  await expect.poll(() => scrollY(page)).toBeGreaterThan(before);

  // And it never overflows sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

/** Counts non-transparent pixels, and their strongest alpha, on the hero's ambient canvas. */
const inkOnCanvas = (page: Page) =>
  page.locator('.ambient canvas').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let pixels = 0;
    let strongest = 0;
    let sum = 0;
    for (let i = 3; i < data.length; i += 4) {
      const a = data[i]!;
      if (a > 0) pixels += 1;
      if (a > strongest) strongest = a;
      sum += a;
    }
    return { pixels, strongest, sum };
  });

test('the hero background is a live canvas that draws, reacts to the pointer and stops off screen', async ({
  page,
}) => {
  await page.goto('/');
  const hero = page.locator('section').first();
  const canvas = page.locator('.ambient canvas');
  await expect(canvas).toHaveCount(1);
  await expect(page.locator('.ambient')).toHaveAttribute('data-active', 'true');

  // It draws something, and a moment later something different (it is moving).
  await expect
    .poll(async () => (await inkOnCanvas(page)).pixels, { timeout: 5000 })
    .toBeGreaterThan(50);
  const first = await inkOnCanvas(page);
  await page.waitForTimeout(700);
  const later = await inkOnCanvas(page);
  expect(later.sum).not.toBe(first.sum);

  // The pointer lights glyphs: moving over the quiet middle raises the brightest pixel.
  const box = (await hero.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 80);
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + 90);
  await page.waitForTimeout(400);
  const lit = await inkOnCanvas(page);
  expect(lit.strongest).toBeGreaterThan(first.strongest);

  // Scrolled well away, the loop stops and the canvas is cleared.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(async () => (await inkOnCanvas(page)).pixels, { timeout: 6000 }).toBe(0);
  // Back at the top it draws again.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(async () => (await inkOnCanvas(page)).pixels, { timeout: 6000 })
    .toBeGreaterThan(50);
});

test('with reduced motion the hero background is a still dotted pattern, with no canvas', async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('.ambient')).toHaveAttribute('data-active', 'false');
  await expect(page.locator('.ambient canvas')).toHaveCount(0);
  await expect(page.locator('.ambient-dots')).toBeVisible();
  await context.close();
});

test('on a phone-width screen the hero background is the still pattern too', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('.ambient')).toHaveAttribute('data-active', 'false');
  await expect(page.locator('.ambient canvas')).toHaveCount(0);
  await context.close();
});

const demoVerdict = (page: Page) => page.locator('[data-demo-verdict] span').first();

test('the hero demo is labelled as a sample and its verdict really cycles', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Sample, illustrative. Not a real result.')).toBeAttached();
  // The demo plays only while on screen, so bring it into view first.
  await page.locator('figure').filter({ hasText: 'Sample, illustrative' }).scrollIntoViewIfNeeded();

  // The real GSAP timeline walks through the three example clients; sample the badge text.
  const seen = new Set<string>();
  await expect
    .poll(
      async () => {
        const text = ((await demoVerdict(page).textContent()) ?? '').trim();
        if (text) seen.add(text);
        return seen.size;
      },
      { timeout: 25_000, intervals: [250] },
    )
    .toBeGreaterThanOrEqual(2);
  for (const verdict of seen) {
    expect(['Not suitable', 'Caution', 'Suitable']).toContain(verdict);
  }
});

test('with reduced motion the hero demo is one still frame that never changes', async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(demoVerdict(page)).toHaveText('Caution');
  await expect(page.locator('[data-demo-row]')).toHaveCount(3);
  await page.waitForTimeout(4500);
  await expect(demoVerdict(page)).toHaveText('Caution');
  await context.close();
});

test('the pinned journey follows the scroll and its stages are buttons that jump', async ({
  page,
}) => {
  await page.goto('/');
  const journey = page.locator('section#journey');
  // Start at the very top of the pinned track, so the first stage is the lit one.
  await journey.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  const steps = journey.getByRole('button');
  await expect(steps).toHaveCount(5);

  // Scrolling through the pinned track moves the highlight from the first stage to a later one.
  await expect(steps.first()).toHaveAttribute('aria-current', 'step');
  await expect
    .poll(
      async () => {
        await page.mouse.wheel(0, 500);
        return steps.last().getAttribute('aria-current');
      },
      { timeout: 15_000, intervals: [200] },
    )
    .toBe('step');

  // Pressing an earlier stage scrolls back to it.
  const before = await page.evaluate(() => window.scrollY);
  await steps.nth(1).click();
  await expect(steps.nth(1)).toHaveAttribute('aria-current', 'step', { timeout: 8000 });
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(before);

  // Every stage's words are on the page the whole time.
  for (const title of ['Mandate', 'Structure', 'Simulate', 'Payoffs', 'Verdict']) {
    await expect(journey.getByText(title).first()).toBeAttached();
  }
});

test('the integrations strip moves, pauses on hover, and the footer wordmark appears', async ({
  page,
}) => {
  await page.goto('/');
  const strip = page.locator('.marquee');
  await strip.scrollIntoViewIfNeeded();
  const track = strip.locator('.marquee__track');
  const x = () => track.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);

  // It is moving: the position changes between two readings.
  const first = await x();
  await page.waitForTimeout(600);
  expect(await x()).not.toBe(first);

  // Hovering stops it.
  await strip.hover();
  const paused = await x();
  await page.waitForTimeout(500);
  expect(await x()).toBe(paused);

  // The wordmark in the footer ends up fully visible once scrolled to.
  const wordmark = page.locator('[data-footer-wordmark]');
  await wordmark.scrollIntoViewIfNeeded();
  await expect
    .poll(() => wordmark.evaluate((el) => getComputedStyle(el).opacity), { timeout: 8000 })
    .toBe('1');
});

test('with reduced motion the integrations strip is one still list', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  const strip = page.locator('.marquee');
  await strip.scrollIntoViewIfNeeded();
  const track = strip.locator('.marquee__track');
  await expect(track).toHaveCSS('animation-name', 'none');
  await expect(strip.locator('.marquee__repeat')).toBeHidden();
  await expect(strip.getByRole('listitem')).toHaveCount(6);
  await context.close();
});

test('smooth scrolling stops when the simulator opens, so it scrolls natively', async ({
  page,
}) => {
  await page.goto('/');
  await expect(html(page)).toHaveClass(/lenis/);
  await page.getByRole('button', { name: 'Continue without an account' }).click();
  await expect(page.getByRole('heading', { name: /client mandate/i })).toBeVisible();
  await expect(html(page)).not.toHaveClass(/lenis/);
});

test('with reduced motion the home page shows everything at once and scrolls natively', async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(html(page)).not.toHaveClass(/lenis/);
  // Content far down the page is already fully visible (no waiting for a scroll-in effect).
  const footerNote = page.getByText(/not guarantees of returns/i);
  await expect(footerNote).toBeAttached();
  await expect
    .poll(() => footerNote.evaluate((el) => getComputedStyle(el.closest('footer')!).opacity))
    .toBe('1');
  await context.close();
});

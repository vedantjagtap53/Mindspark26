// Phase 5: the rebuilt landing page. It must keep the old page's behaviour, say only what the product
// does (PRD §3, §7, §8), and keep every word in the page whether or not any animation runs.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockIntersectionObserver } from './helpers';
import { BRAND_NAME } from '../../src/constants/brand';
import { LandingPage, preloadLanding } from '../../src/pages/LandingPage';
import { CAPABILITIES, STAGE_STEPS } from '../../src/pages/landing/content';

// The page loads on demand in the app (and now pulls in GSAP and Lenis); load it once up front so
// no test pays for that, or races its timeout.
beforeAll(preloadLanding);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('landing page (account mode)', () => {
  it('offers Log in and Create account in the header and the hero, wired to the callbacks', async () => {
    const onLogin = vi.fn();
    const onRegister = vi.fn();
    render(<LandingPage onLogin={onLogin} onRegister={onRegister} />);

    const logins = await screen.findAllByRole('button', { name: 'Log in' });
    const registers = screen.getAllByRole('button', { name: 'Create account' });
    expect(logins).toHaveLength(2);
    expect(registers).toHaveLength(2);
    fireEvent.click(logins[1]!);
    fireEvent.click(registers[0]!);
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onRegister).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Launch Simulator|Start New Mandate/ })).toBeNull();
  });

  it('offers "Continue without an account" only when the server allows it', async () => {
    const onStart = vi.fn();
    const { rerender } = render(
      <LandingPage onLogin={() => {}} onRegister={() => {}} onStart={onStart} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Continue without an account' }));
    expect(onStart).toHaveBeenCalledTimes(1);

    rerender(<LandingPage onLogin={() => {}} onRegister={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Continue without an account' })).toBeNull();
  });
});

describe('landing page (start mode)', () => {
  it('shows Launch Simulator and Start New Mandate, and shows the account slot', async () => {
    const onStart = vi.fn();
    render(<LandingPage onStart={onStart} userSlot={<span>menu slot</span>} />);
    fireEvent.click(await screen.findByRole('button', { name: /Launch Simulator/ }));
    fireEvent.click(screen.getByRole('button', { name: /Start New Mandate/ }));
    expect(onStart).toHaveBeenCalledTimes(2);
    expect(screen.getByText('menu slot')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Log in' })).toBeNull();
  });
});

describe('landing page header', () => {
  it('starts un-docked, tightens when the top sentinel scrolls away, and relaxes on return', async () => {
    const Fake = mockIntersectionObserver();
    const { container } = render(<LandingPage onStart={() => {}} />);
    await screen.findByRole('heading', { level: 1 });
    const header = container.querySelector('header')!;
    expect(header.getAttribute('data-docked')).toBe('false');

    // The sentinel is the first observed element on the page.
    const sentinel = Fake.instances.find(
      (o) => o.observed[0]?.getAttribute('aria-hidden') === 'true',
    );
    expect(sentinel).toBeTruthy();
    act(() => sentinel!.trigger(false));
    expect(header.getAttribute('data-docked')).toBe('true');
    act(() => sentinel!.trigger(true));
    expect(header.getAttribute('data-docked')).toBe('false');
  });

  it('has in-page links that point at real sections', async () => {
    const { container } = render(<LandingPage onStart={() => {}} />);
    await screen.findByRole('heading', { level: 1 });
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    for (const link of within(nav).getAllByRole('link')) {
      const id = link.getAttribute('href')!.slice(1);
      expect(container.querySelector(`section#${id}`), `section #${id}`).not.toBeNull();
    }
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Features', 'Products', 'Journey']);
  });
});

describe('integrations strip and footer', () => {
  it('lists each service once for assistive tech and repeats it, hidden, for the seamless loop', async () => {
    const { container } = render(<LandingPage onStart={() => {}} />);
    await screen.findByRole('heading', { level: 1 });
    const strip = container.querySelector('.marquee')!;
    expect(strip.getAttribute('data-running')).toBe('true'); // no observer in jsdom: counts as visible
    const lists = strip.querySelectorAll('ul');
    expect(lists).toHaveLength(2);
    expect(lists[0]!.getAttribute('aria-hidden')).toBeNull();
    expect(lists[1]!.getAttribute('aria-hidden')).toBe('true');
    const names = [...lists[0]!.querySelectorAll('li')].map((li) => li.textContent);
    expect(names).toEqual([
      'Supabase',
      'Gemini',
      'Yahoo Finance',
      'Frankfurter',
      'Upstox',
      'Finnhub',
    ]);
    expect([...lists[1]!.querySelectorAll('li')].map((li) => li.textContent)).toEqual(names);
  });

  it('pauses the strip while it is off screen', async () => {
    const Fake = mockIntersectionObserver();
    const { container } = render(<LandingPage onStart={() => {}} />);
    await screen.findByRole('heading', { level: 1 });
    const strip = container.querySelector('.marquee')!;
    expect(strip.getAttribute('data-running')).toBe('false');
    const observer = Fake.instances.find((o) => o.observed[0] === strip)!;
    act(() => observer.trigger(true));
    expect(strip.getAttribute('data-running')).toBe('true');
    act(() => observer.trigger(false));
    expect(strip.getAttribute('data-running')).toBe('false');
  });

  it('does not overstate: it says some services need keys and nothing is substituted', async () => {
    const { container } = render(<LandingPage onStart={() => {}} />);
    await screen.findByRole('heading', { level: 1 });
    const text = container.querySelector('.marquee')!.closest('section')!.textContent ?? '';
    expect(text).toMatch(/need keys you provide/i);
    expect(text).toMatch(/instead of substituting data/i);
    expect(text).not.toMatch(/partner|trusted by|official/i);
  });

  it('keeps the footer wordmark in the page as plain text', async () => {
    const { container } = render(<LandingPage onStart={() => {}} />);
    await screen.findByRole('heading', { level: 1 });
    const word = container.querySelector('[data-footer-wordmark]');
    expect(word?.textContent).toBe(BRAND_NAME);
  });
});

describe('landing page content', () => {
  const renderLanding = async () => {
    const view = render(<LandingPage onStart={() => {}} />);
    await screen.findByRole('heading', { level: 1 });
    return view;
  };

  it('has one page heading and names the product from a single constant', async () => {
    await renderLanding();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByText(new RegExp(BRAND_NAME)).length).toBeGreaterThan(0);
  });

  it('shows all three products and every capability and journey step as readable text', async () => {
    await renderLanding();
    for (const code of ['ELN', 'DCD', 'CPN']) expect(screen.getByText(code)).toBeTruthy();
    for (const { title } of CAPABILITIES) {
      expect(screen.getByRole('heading', { name: title, level: 3 })).toBeTruthy();
    }
    for (const { title } of STAGE_STEPS) {
      expect(screen.getByRole('heading', { name: title, level: 3 })).toBeTruthy();
    }
    const journey = screen.getByRole('region', { name: 'The five-stage journey' });
    expect(within(journey).getAllByRole('listitem')).toHaveLength(STAGE_STEPS.length);
  });

  it('keeps the "not a guarantee" notice and makes no claim outside the PRD', async () => {
    const { container } = await renderLanding();
    const text = container.textContent ?? '';
    expect(text).toMatch(/not a guarantee/i);
    // Claims the old page made that the product does not back: pricing, a stress-test library,
    // Monte Carlo as a feature name, "real-time" forecasting, and an edition label.
    expect(text).not.toMatch(/Precision Pricing|Stress Testing|Monte Carlo|Enterprise Edition/i);
    expect(text).not.toMatch(/real-time/i);
  });

  it('leaves every section in the page when nothing has scrolled into view', async () => {
    // Reveal only starts content at opacity 0; it must never remove it from the DOM.
    const { container } = await renderLanding();
    // Hero, features, products, integrations and the journey.
    expect(container.querySelectorAll('section').length).toBe(5);
    expect(container.querySelector('footer')?.textContent).toMatch(/not guarantees of returns/i);
  });
});

// Phase 3: result entrances. The rule being tested: every value is in the page from the first render
// and animation only fades or lifts it in; nothing is delayed behind, or computed by, an animation.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ShockOutcome } from '@mindspark/shared';
import { ScenarioTable } from '../../src/components/risk/ScenarioTable';
import { MAX_STAGGERED_ITEMS } from '../../src/motion/tokens';
import { revealStyle } from '../../src/motion/reveal';

afterEach(cleanup);

const css = readFileSync(resolve(import.meta.dirname, '../../src/index.css'), 'utf8');

const scenario = (shockPct: number, payoff: number): ShockOutcome => ({
  shockPct,
  level: 25_000 * (1 + shockPct / 100),
  payoff,
  returnPct: (payoff / 1_000_000 - 1) * 100,
  lossAmount: Math.max(0, 1_000_000 - payoff),
  knockedIn: shockPct < -20,
});

describe('revealStyle', () => {
  const index = (i: number) => (revealStyle(i) as Record<string, unknown>)['--i'];

  it('staggers by position and caps the delay for long lists', () => {
    expect(index(0)).toBe(0);
    expect(index(3)).toBe(3);
    expect(index(MAX_STAGGERED_ITEMS)).toBe(MAX_STAGGERED_ITEMS);
    expect(index(MAX_STAGGERED_ITEMS + 50)).toBe(MAX_STAGGERED_ITEMS);
  });

  it('never goes negative or fractional', () => {
    expect(index(-4)).toBe(0);
    expect(index(2.7)).toBe(2);
  });
});

describe('scenario table entrance', () => {
  const scenarios = [
    scenario(-25, 700_000),
    scenario(-10, 1_000_000),
    scenario(0, 1_047_500),
    scenario(15, 1_047_500),
  ];

  it('has every row and every figure in the page at once, each row fading in on a stagger', () => {
    render(<ScenarioTable scenarios={scenarios} currency="INR" levelLabel="Level" />);
    const body = screen.getAllByRole('rowgroup')[1]!;
    const rows = within(body).getAllByRole('row');
    expect(rows).toHaveLength(scenarios.length);

    rows.forEach((row, i) => {
      expect(row.className).toContain('reveal-fade');
      expect(row.getAttribute('style')).toContain(`--i: ${i}`);
    });
    // Shocks are readable text straight away, not revealed by script.
    expect(screen.getByText('-25%')).toBeTruthy();
    expect(screen.getByText('+15%')).toBeTruthy();
  });

  it('shows the figures exactly as received, with no intermediate values', () => {
    render(<ScenarioTable scenarios={scenarios} currency="INR" levelLabel="Level" />);
    const text = document.body.textContent ?? '';
    // 1,047,500 comes from the backend result and must appear verbatim (formatted), never rounded
    // or animated through other values.
    expect(text).toMatch(/1,047,500|10,47,500/);
  });
});

describe('entrance styles', () => {
  it('use the motion tokens and keep content visible when motion is off', () => {
    expect(css).toMatch(/\.reveal-up\s*\{[^}]*var\(--motion-slow\)[^}]*var\(--ease-out\)[^}]*both/);
    expect(css).toMatch(/\.reveal-fade\s*\{[^}]*var\(--motion-slow\)[^}]*both/);
    expect(css).toMatch(/\.badge-in\s*\{[^}]*var\(--motion-base\)[^}]*both/);
    // Staggered via --i times the stagger token.
    expect(css).toContain('calc(var(--i, 0) * var(--stagger))');
  });

  it('only fade, lift or settle: no colour change on the verdict badge', () => {
    const badge = css.match(/@keyframes badgeIn\s*\{[\s\S]*?\n\}\n/)?.[0] ?? '';
    expect(badge).toContain('opacity');
    expect(badge).toContain('scale');
    expect(badge).not.toMatch(/color|background/);
  });
});

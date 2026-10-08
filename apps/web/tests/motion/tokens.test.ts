import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_STAGGERED_ITEMS,
  duration,
  easeInOut,
  easeOut,
  stagger,
  staggerDelay,
} from '../../src/motion/tokens';

const css = readFileSync(resolve(import.meta.dirname, '../../src/index.css'), 'utf8');

const variable = (name: string): string => {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match?.[1]) throw new Error(`CSS variable ${name} is not defined in index.css`);
  return match[1].trim();
};
const seconds = (name: string) => parseFloat(variable(name)) / 1000;
const bezier = (name: string) =>
  variable(name)
    .replace(/^cubic-bezier\(|\)$/g, '')
    .split(',')
    .map(Number);

describe('motion tokens', () => {
  it('match the CSS variables, which are the source of truth', () => {
    expect(duration.fast).toBeCloseTo(seconds('--motion-fast'));
    expect(duration.base).toBeCloseTo(seconds('--motion-base'));
    expect(duration.slow).toBeCloseTo(seconds('--motion-slow'));
    expect(duration.scene).toBeCloseTo(seconds('--motion-scene'));
    expect(stagger).toBeCloseTo(seconds('--stagger'));
    expect([...easeOut]).toEqual(bezier('--ease-out'));
    expect([...easeInOut]).toEqual(bezier('--ease-in-out'));
  });

  it('caps the stagger so late list items do not wait', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(3)).toBeCloseTo(3 * stagger);
    expect(staggerDelay(MAX_STAGGERED_ITEMS + 20)).toBeCloseTo(MAX_STAGGERED_ITEMS * stagger);
    expect(staggerDelay(-2)).toBe(0);
  });

  it('gives buttons and tiles hover lifts only to real pointers, and a visible keyboard focus', () => {
    // Every :hover rule on a clay button or tile must sit inside the hover-capable media query.
    const outsideHover = css
      .replace(/@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\n\}\n/g, '')
      .match(/\.clay-(?:btn-primary|btn-secondary|tile-interactive|press):hover/g);
    expect(outsideHover).toBeNull();
    for (const name of ['clay-btn-primary', 'clay-btn-secondary', 'clay-press']) {
      expect(css).toContain(`.${name}:focus-visible`);
      expect(css).toContain(`.${name}:active`);
    }
    expect(css).toContain('.clay-tile-interactive:focus-visible');
  });

  it('uses the motion tokens, not fixed timings, for the clay surfaces', () => {
    const clay = css.slice(
      css.indexOf('.clay-tile {'),
      css.indexOf('/* Journey Stepper Classes */'),
    );
    expect(clay).not.toMatch(/transition:[^;]*\b0\.\d+s/);
    expect(clay).not.toContain('transition: all');
    expect(clay).toContain('var(--motion-fast)');
    expect(clay).toContain('var(--ease-out)');
  });

  it('turns off motion for print and reduced motion in the stylesheet', () => {
    expect(css).toMatch(/@media print[\s\S]*animation:\s*none\s*!important/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration/);
  });
});

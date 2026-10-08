// Phase 4: the product cards are a grid normally and a Swiper carousel on a phone.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductCards } from '../../src/components/dashboard/ProductCards';
import { PHONE_QUERY } from '../../src/motion/useMediaQuery';
import { mockMatchMedia } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProductCards', () => {
  it('shows a three-card grid on wider screens, with no carousel', () => {
    mockMatchMedia({ [PHONE_QUERY]: false });
    const { container } = render(<ProductCards product="ELN" onProduct={() => {}} />);
    const group = screen.getByRole('radiogroup', { name: 'Product' });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(container.querySelector('.swiper')).toBeNull();
  });

  it('shows the same three products in a carousel on a phone, and picking one still works', async () => {
    mockMatchMedia({ [PHONE_QUERY]: true });
    const picked: string[] = [];
    const { container } = render(<ProductCards product="DCD" onProduct={(p) => picked.push(p)} />);
    // Swiper loads on demand; until it arrives the same cards are shown stacked, never missing.
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    await waitFor(() => expect(container.querySelector('.swiper')).not.toBeNull());

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    fireEvent.click(radios[2]!);
    expect(picked).toEqual(['CPN']);
  });
});

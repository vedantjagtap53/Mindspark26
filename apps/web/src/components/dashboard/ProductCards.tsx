// Dashboard: one card per product (PRD §7.1). Choosing a card selects the product form.
import { CheckCircle2 } from 'lucide-react';
import { PRODUCT_TYPES } from '@mindspark/shared';
import { PRODUCTS } from '../../constants/products';
import { PHONE_QUERY, useMediaQuery } from '../../motion/useMediaQuery';
import type { ProductType } from '../../state/forms';
import { LazyCarousel } from '../LazyCarousel';

interface Props {
  product: ProductType;
  onProduct: (p: ProductType) => void;
}

export function ProductCards({ product, onProduct }: Props) {
  // On a phone the three cards become a swipe carousel (the chosen product stays the first one
  // shown); everywhere else they are the same three-column grid as before.
  const phone = useMediaQuery(PHONE_QUERY);
  const cards = PRODUCT_TYPES.map((code) => {
    const info = PRODUCTS[code];
    const active = product === code;
    return (
      <button
        key={code}
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => onProduct(code)}
        className={`p-4 rounded-2xl text-left transition-all ${
          active
            ? 'clay-tile ring-2 ring-[var(--accent-primary)]/20'
            : 'bg-[var(--card-bg)]/70 border border-[var(--border-color)] hover:bg-[var(--card-bg)]'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[var(--accent-primary)] text-[var(--accent-text)]">
            {code}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-[var(--ink-muted)]">
              {info.riskRating} risk
            </span>
            {active && (
              <CheckCircle2 className="w-4 h-4 text-[var(--status-suitable-text)]" aria-hidden />
            )}
          </span>
        </div>
        <h3 className="font-serif text-sm font-bold text-[var(--ink-primary)]">{info.name}</h3>
        <p className="text-[11px] text-[var(--ink-muted)] mt-1 leading-snug">{info.tagline}</p>
      </button>
    );
  });
  return (
    <div role="radiogroup" aria-label="Product">
      {phone ? (
        <LazyCarousel
          label="Products"
          slidesPerView={1.12}
          initialSlide={PRODUCT_TYPES.indexOf(product)}
        >
          {cards}
        </LazyCarousel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">{cards}</div>
      )}
    </div>
  );
}

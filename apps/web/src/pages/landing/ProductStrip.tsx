import { PRODUCT_TYPES } from '@mindspark/shared';
import { Reveal } from '../../components/Reveal';
import { PRODUCTS } from '../../constants/products';
import { PRODUCTS_HEADING } from './content';

export function ProductStrip() {
  return (
    <section
      id="products"
      aria-labelledby="products-title"
      className="py-24 bg-[var(--canvas-bg)] border-t border-[var(--border-subtle)]"
    >
      <div className="max-w-6xl mx-auto px-6">
        <Reveal className="text-center mb-12 space-y-3">
          <h2
            id="products-title"
            className="text-3xl font-serif font-bold text-[var(--ink-primary)]"
          >
            {PRODUCTS_HEADING.title}
          </h2>
          <p className="text-[var(--ink-secondary)] max-w-2xl mx-auto">{PRODUCTS_HEADING.text}</p>
        </Reveal>

        <ul className="grid md:grid-cols-3 gap-6">
          {PRODUCT_TYPES.map((code, i) => {
            const info = PRODUCTS[code];
            return (
              <li key={code}>
                <Reveal index={i} className="h-full">
                  <div className="clay-tile h-full p-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[var(--accent-primary)] text-[var(--accent-text)]">
                        {code}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                        {info.riskRating} risk
                      </span>
                    </div>
                    <h3 className="font-serif text-lg font-bold text-[var(--ink-primary)]">
                      {info.name}
                    </h3>
                    <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
                      {info.tagline}
                    </p>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

import { useInView } from '../../motion/useInView';
import { DATA_STRIP } from './content';

/**
 * A slow strip of the services the app is built to use. Pure CSS: the list is repeated once so it
 * loops without a seam (the repeat is hidden from assistive tech), it stops while off screen and
 * while hovered, and with reduced motion or in print it becomes one static, wrapped list.
 */
export function DataStrip() {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <section
      aria-labelledby="data-title"
      className="py-14 bg-[var(--canvas-bg)] border-t border-[var(--border-subtle)]"
    >
      <div className="max-w-6xl mx-auto px-6 text-center space-y-2 mb-8">
        <h2 id="data-title" className="text-xl font-serif font-bold text-[var(--ink-primary)]">
          {DATA_STRIP.title}
        </h2>
        <p className="text-sm text-[var(--ink-muted)] max-w-2xl mx-auto">{DATA_STRIP.note}</p>
      </div>

      <div ref={ref} className="marquee" data-running={inView ? 'true' : 'false'}>
        <div className="marquee__track">
          <ul className="marquee__list" aria-label="Services">
            {DATA_STRIP.sources.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <ul className="marquee__list marquee__repeat" aria-hidden>
            {DATA_STRIP.sources.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

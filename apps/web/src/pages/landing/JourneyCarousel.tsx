// Phone version of the five-stage journey: one card per stage, swiped sideways.
import { LazyCarousel } from '../../components/LazyCarousel';
import { STAGES_HEADING, STAGE_STEPS } from './content';

export function JourneyCarousel() {
  return (
    <section
      id="journey"
      aria-labelledby="journey-title"
      className="py-16 bg-[var(--card-bg)] border-t border-[var(--border-subtle)]"
    >
      <div className="px-6">
        <h2
          id="journey-title"
          className="text-2xl font-serif font-bold text-[var(--ink-primary)] text-center mb-8"
        >
          {STAGES_HEADING}
        </h2>
        <LazyCarousel label="The five stages" slidesPerView={1.12}>
          {STAGE_STEPS.map(({ title, text }, index) => (
            <article
              key={title}
              aria-label={`Stage ${index + 1} of ${STAGE_STEPS.length}: ${title}`}
              className="clay-tile p-6 space-y-3 h-full"
            >
              <span className="w-10 h-10 rounded-full bg-[var(--accent-primary)] text-[var(--accent-text)] flex items-center justify-center font-bold">
                {index + 1}
              </span>
              <h3 className="font-semibold text-lg text-[var(--ink-primary)]">{title}</h3>
              <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">{text}</p>
            </article>
          ))}
        </LazyCarousel>
      </div>
    </section>
  );
}

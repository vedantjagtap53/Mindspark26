import { Reveal } from '../../components/Reveal';
import { STAGES_HEADING, STAGE_STEPS } from './content';

/** The five stages as an ordered list: real text and real order, with or without any scroll effect. */
export function JourneySteps() {
  return (
    <section
      id="journey"
      aria-labelledby="journey-title"
      className="py-24 bg-[var(--card-bg)] border-t border-[var(--border-subtle)]"
    >
      <div className="max-w-6xl mx-auto px-6">
        <Reveal className="text-center mb-16">
          <h2
            id="journey-title"
            className="text-3xl font-serif font-bold text-[var(--ink-primary)]"
          >
            {STAGES_HEADING}
          </h2>
        </Reveal>

        <ol className="grid gap-8 md:grid-cols-5 relative">
          <div
            aria-hidden
            className="hidden md:block absolute top-5 left-[10%] right-[10%] h-0.5 bg-[var(--border-color)]"
          />
          {STAGE_STEPS.map(({ title, text }, index) => (
            <li key={title} className="relative">
              <Reveal
                index={index}
                className="flex md:flex-col items-start md:items-center gap-4 md:text-center"
              >
                <span className="w-10 h-10 shrink-0 rounded-full bg-[var(--accent-primary)] text-[var(--accent-text)] flex items-center justify-center font-bold shadow-md relative z-10">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-semibold text-[var(--ink-primary)]">{title}</h3>
                  <p className="text-sm text-[var(--ink-secondary)] mt-1 leading-relaxed">{text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

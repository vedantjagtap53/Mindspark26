import { Reveal } from '../../components/Reveal';
import { CAPABILITIES, CAPABILITIES_HEADING } from './content';

export function CapabilityGrid() {
  return (
    <section
      id="features"
      aria-labelledby="capabilities-title"
      className="py-24 bg-[var(--card-bg)] border-t border-[var(--border-subtle)] relative z-20"
    >
      <div className="max-w-6xl mx-auto px-6">
        <Reveal className="text-center mb-16 space-y-4">
          <h2
            id="capabilities-title"
            className="text-3xl font-serif font-bold text-[var(--ink-primary)]"
          >
            {CAPABILITIES_HEADING.title}
          </h2>
          <p className="text-[var(--ink-secondary)] max-w-2xl mx-auto">
            {CAPABILITIES_HEADING.text}
          </p>
        </Reveal>

        <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {CAPABILITIES.map(({ icon: Icon, title, text }, i) => (
            <li key={title}>
              <Reveal index={i % 3} className="h-full">
                <div className="clay-tile-interactive !bg-[var(--well-bg)] h-full space-y-4 p-8">
                  <div className="w-12 h-12 rounded-xl bg-[var(--card-bg)] shadow-sm flex items-center justify-center border border-[var(--border-subtle)]">
                    <Icon className="w-6 h-6 text-[var(--accent-primary)]" aria-hidden />
                  </div>
                  <h3 className="text-xl font-bold text-[var(--ink-primary)]">{title}</h3>
                  <p className="text-[var(--ink-secondary)] leading-relaxed">{text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

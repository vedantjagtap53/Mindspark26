import { ArrowRight, ShieldCheck, Activity, BarChart3, LineChart, Target, Zap } from 'lucide-react';
import { CustomCursor } from '../components/CustomCursor';

interface Props {
  onStart: () => void;
}

export function LandingPage({ onStart }: Props) {
  return (
    <div className="min-h-screen bg-[var(--canvas-bg)] text-[var(--canvas-text)] font-sans flex flex-col selection:bg-[var(--accent-primary)] selection:text-white">
      <CustomCursor />
      
      {/* Navbar */}
      <header className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--canvas-bg)]/80 backdrop-blur-md sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="font-serif text-xl font-bold tracking-tight text-[var(--ink-primary)]">FinStrukt</h1>
          </div>
        </div>
        <button 
          onClick={onStart}
          className="px-4 py-2 text-sm font-semibold text-white bg-[var(--accent-primary)] hover:opacity-90 rounded-full transition-all flex items-center gap-2 shadow-lg"
        >
          Launch Simulator <ArrowRight className="w-4 h-4" />
        </button>
      </header>

      <main className="flex-1 flex flex-col">
        {/* Refined Vibrant Hero Section */}
        <section className="relative overflow-hidden pt-28 pb-32 flex flex-col items-center justify-center text-center px-4">
          {/* Subtle Elegance Background Elements */}
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[700px] h-[700px] bg-[var(--accent-gold)]/10 blur-[100px] rounded-full pointer-events-none" />

          <div className="relative z-10 max-w-5xl mx-auto space-y-8">
            
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-[var(--ink-primary)]">
              Next-Gen <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-gold)]">Payoff Simulation</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-[var(--ink-secondary)] max-w-3xl mx-auto font-light leading-relaxed">
              Design, test, and analyze structured products with intelligent client suitability mapping and real-time market forecasting. Tailored for private banking excellence.
            </p>
            
            <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={onStart}
                className="px-8 py-4 text-lg font-bold text-white bg-[var(--accent-primary)] hover:scale-105 rounded-full transition-transform shadow-xl shadow-black/10 flex items-center gap-3"
              >
                Start New Mandate <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </section>

        {/* Core Features Grid */}
        <section className="py-24 bg-[var(--card-bg)] border-t border-[var(--border-subtle)] relative z-20">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-3xl font-serif font-bold text-[var(--ink-primary)]">End-to-End Deal Structuring</h2>
              <p className="text-[var(--ink-secondary)] max-w-2xl mx-auto">From initial client mandate to final institutional memorandum, FinStrukt provides the tools you need to structure confidently.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { icon: ShieldCheck, title: "Intelligent Suitability", desc: "Automatic mapping of client risk profiles to product structures to ensure regulatory and internal compliance." },
                { icon: Activity, title: "Real-Time Simulation", desc: "Advanced Monte Carlo and historical simulation engine for ELNs, DCDs, and CPNs across multiple market scenarios." },
                { icon: BarChart3, title: "Institutional Outcomes", desc: "Generate print-ready memorandums, detailed payout charts, and comprehensive audit trails for every client presentation." },
                { icon: LineChart, title: "Stress Testing", desc: "Evaluate product resilience against historic market crashes and extreme volatility events with a single click." },
                { icon: Target, title: "Precision Pricing", desc: "Input precise barriers, strikes, and coupons to instantly see probability of profit and expected return distributions." },
                { icon: Zap, title: "Frictionless Workflow", desc: "Seamless 5-stage journey from Mandate collection to Final Verdict, minimizing manual entry and cognitive load." }
              ].map((feature, i) => (
                <div key={i} className="space-y-4 p-8 rounded-2xl bg-[var(--well-bg)] border border-[var(--border-subtle)] transition-all hover:-translate-y-1 hover:shadow-md">
                  <div className="w-12 h-12 rounded-xl bg-[var(--card-bg)] shadow-sm flex items-center justify-center border border-[var(--border-subtle)]">
                    <feature.icon className="w-6 h-6 text-[var(--accent-primary)]" />
                  </div>
                  <h3 className="text-xl font-bold text-[var(--ink-primary)]">{feature.title}</h3>
                  <p className="text-[var(--ink-secondary)] leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-24 bg-[var(--canvas-bg)] border-t border-[var(--border-subtle)]">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-serif font-bold text-[var(--ink-primary)]">The 5-Stage Journey</h2>
            </div>
            <div className="flex flex-col md:flex-row gap-4 justify-between relative">
              <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-[var(--border-subtle)] -translate-y-1/2 z-0" />
              {[
                "1. Mandate", "2. Structure", "3. Simulate", "4. Payoffs", "5. Verdict"
              ].map((step, index) => (
                <div key={step} className="relative z-10 flex flex-col items-center gap-4 bg-[var(--canvas-bg)] px-4 py-2">
                  <div className="w-10 h-10 rounded-full bg-[var(--accent-primary)] text-white flex items-center justify-center font-bold shadow-md">
                    {index + 1}
                  </div>
                  <span className="font-semibold text-[var(--ink-primary)] whitespace-nowrap">{step.split('. ')[1]}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 text-center text-sm text-[var(--ink-muted)] border-t border-[var(--border-subtle)] bg-[var(--canvas-bg)] relative z-20">
        <p>&copy; {new Date().getFullYear()} FinStrukt Simulator. Enterprise Edition.</p>
      </footer>
    </div>
  );
}

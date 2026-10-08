// Landing-page copy. Every claim here must describe what the product does today (PRD §3, §7 and §8):
// no pricing, no stress-test library, no live-trading language, and no promise about returns.
import type { LucideIcon } from 'lucide-react';
import { Activity, BarChart3, FileText, LineChart, MessageSquare, ShieldCheck } from 'lucide-react';

export const HERO = {
  title: 'Payoff simulation, checked against the client',
  intro:
    'Test an Equity Linked Note, a Dual Currency Deposit or a Capital Protected Note before you recommend it. See the payoff and the risk, get a rule-based Suitable, Caution or Not suitable verdict with its reasons, then a plain-language explanation.',
  notice: 'A simulation, not a guarantee. Results show a range or a chosen shock, never a promise.',
} as const;

export interface Capability {
  icon: LucideIcon;
  title: string;
  text: string;
}

export const CAPABILITIES_HEADING = {
  title: 'From client profile to a printed memo',
  text: 'Everything is calculated on the server and shown as it was calculated. The browser never decides a number or a verdict.',
} as const;

export const CAPABILITIES: Capability[] = [
  {
    icon: ShieldCheck,
    title: 'Rule-based suitability',
    text: "Fixed rules compare the product with the client's risk appetite, horizon, loss tolerance and concentration, and list the reason behind each verdict.",
  },
  {
    icon: Activity,
    title: 'Two ways to simulate',
    text: 'Mode A shows a likely range from a forecast built on recent price history. Mode B applies a shock you choose, such as −10%. Both use the same payoff engine.',
  },
  {
    icon: LineChart,
    title: 'Payoff and risk',
    text: 'The payoff across a range of levels with the strike, barrier and breakeven marked, plus low, base and high cases.',
  },
  {
    icon: BarChart3,
    title: 'Scenario table',
    text: 'The payoff at −25%, −10%, 0% and +15% for every run, in currency and in percent.',
  },
  {
    icon: MessageSquare,
    title: 'Explanation and chat',
    text: "A plain-language explanation of the result, and a chat that answers questions from this simulation's own numbers and the product notes.",
  },
  {
    icon: FileText,
    title: 'Saved runs and memo',
    text: 'Each run is saved to the account that made it. Compare two or three runs side by side and print a memo of any of them.',
  },
];

export const STAGES_HEADING = 'The five-stage journey';

export const STAGE_STEPS: Array<{ title: string; text: string }> = [
  {
    title: 'Mandate',
    text: "Describe the client's risk appetite, investment horizon, loss tolerance and concentration.",
  },
  { title: 'Structure', text: 'Choose a product and enter its terms, checked as you type.' },
  { title: 'Simulate', text: 'Pick Mode A or Mode B and run the simulation.' },
  { title: 'Payoffs', text: 'Inspect the payoff curve, the scenarios and the risk.' },
  {
    title: 'Verdict',
    text: 'Read the suitability verdict, the explanation and ask follow-up questions.',
  },
];

export const PRODUCTS_HEADING = {
  title: 'Three products',
  text: 'Each has its own payoff logic and its own risk rating.',
} as const;

/**
 * Services the code integrates with (see README "Configuration" and docs/market-data.md). The note says
 * so honestly: some need keys of your own, and nothing here claims a partnership or a live feed.
 */
export const DATA_STRIP = {
  title: 'Built to work with',
  note: 'The services behind the simulator. Some need keys you provide; without them the app says what is missing instead of substituting data.',
  sources: ['Supabase', 'Gemini', 'Yahoo Finance', 'Frankfurter', 'Upstox', 'Finnhub'],
} as const;

export const FOOTER_NOTE = 'Simulations are not guarantees of returns.';

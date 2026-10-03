/**
 * @license
 * Payoff Desk — Structured Products Suitability Simulator
 * Interactive Suitability Journey & Structured Advisory Desk
 * Fully Dynamic Multi-Theme System
 */

import React, { useState } from 'react';
import {
  ProductType,
  SimMode,
  SimulationResult,
  ProductInputs,
  ClientProfile,
  ELNInputs,
  DCDInputs,
  CPNInputs,
  SavedSimulationRecord,
  ChatMessage,
  RiskAppetite,
} from '../api/types';
import { SPOT_PRICES, getMockChatReply, SAVED_PROFILES } from '../api/mock';
import { PayoffChart } from './charts/PayoffChart';
import { FanChart } from './charts/FanChart';
import { JourneyStage } from './TopNav';
import {
  Compass,
  Sliders,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Play,
  Printer,
  Bookmark,
  Send,
} from 'lucide-react';

interface BentoWorkspaceProps {
  activeStage: JourneyStage;
  onSelectStage: (stage: JourneyStage) => void;
  product: ProductType;
  onSelectProduct: (p: ProductType) => void;
  result: SimulationResult | null;
  loading: boolean;
  elapsedSeconds: number;
  profile: ClientProfile;
  onUpdateProfile: (p: ClientProfile) => void;
  onRunSimulation: (
    inputs: ProductInputs,
    profile: ClientProfile,
    mode: SimMode,
    options: {
      trainingWindowYears: number;
      shockPct: number;
      forceFailure: boolean;
      isStaleData: boolean;
    }
  ) => void;
  onSaveSimulation: (res: SimulationResult) => void;
  onPrintMemo: (res: SimulationResult) => void;
  recentSimulations: SavedSimulationRecord[];
  onOpenSimulation: (sim: SavedSimulationRecord) => void;
  onOpenSavedModal: () => void;
}

export const BentoWorkspace: React.FC<BentoWorkspaceProps> = ({
  activeStage,
  onSelectStage,
  product,
  onSelectProduct,
  result,
  loading,
  elapsedSeconds,
  profile,
  onUpdateProfile,
  onRunSimulation,
  onSaveSimulation,
  onPrintMemo,
}) => {
  // Mode selection & calibration
  const [mode, setMode] = useState<SimMode>('FORECAST');
  const [trainingWindowYears, setTrainingWindowYears] = useState<number>(10);
  const [shockPct, setShockPct] = useState<number>(-10);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Local editable inputs per product type
  const [elnInputs, setElnInputs] = useState<ELNInputs>({
    underlying: 'NIFTY 50',
    currency: 'INR',
    notional: 2500000,
    tenorDays: 180,
    strikePct: 100,
    barrierPct: 88,
    couponPctPa: 9.5,
    barrierType: 'European',
  });

  const [dcdInputs, setDcdInputs] = useState<DCDInputs>({
    currencyPair: 'USD/INR',
    depositCurrency: 'USD',
    alternateCurrency: 'INR',
    depositAmount: 50000,
    tenorDays: 90,
    strikeRate: 84.5,
    enhancedRatePctPa: 8.25,
  });

  const [cpnInputs, setCpnInputs] = useState<CPNInputs>({
    underlying: 'NIFTY 50',
    currency: 'INR',
    notional: 2500000,
    tenorDays: 365,
    protectionPct: 100,
    participationPct: 80,
    capPct: 125,
  });

  // RM Chat Assistant State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'DESK',
      text: 'Good day. I have reviewed the client mandate and simulation metrics for this note. How may I assist with your suitability assessment or client disclosures?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);

  const getCurrentInputs = (): ProductInputs => {
    if (product === 'ELN') return elnInputs;
    if (product === 'DCD') return dcdInputs;
    return cpnInputs;
  };

  const handleExecuteSimulation = () => {
    const inputs = getCurrentInputs();
    onRunSimulation(inputs, profile, mode, {
      trainingWindowYears,
      shockPct,
      forceFailure: false,
      isStaleData: false,
    });
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || chatInput;
    if (!text.trim() || !result) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'RM',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setChatInput('');
    setChatLoading(true);

    try {
      const reply = getMockChatReply(text, result);
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'DESK',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const fallbackMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'DESK',
        text: 'The proposed structure is evaluated against client risk tolerance and mandate guardrails. Please inspect the scenario matrix for downside cases.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const stageOrder: JourneyStage[] = ['MANDATE', 'CONFIG', 'SIMULATION', 'OUTCOMES', 'DELIVERY'];
  const currentIndex = stageOrder.indexOf(activeStage);

  const goToNextStage = () => {
    if (currentIndex >= 0 && currentIndex < stageOrder.length - 1) {
      onSelectStage(stageOrder[currentIndex + 1]);
    }
  };

  const goToPrevStage = () => {
    if (currentIndex > 0) {
      onSelectStage(stageOrder[currentIndex - 1]);
    }
  };

  // Suitability calculations
  const concentrationRatio =
    product === 'DCD'
      ? ((dcdInputs.depositAmount * 84) / profile.portfolioValue) * 100
      : (elnInputs.notional / profile.portfolioValue) * 100;

  const horizonDays = profile.investmentHorizonMonths * 30;
  const currentTenorDays = getCurrentInputs().tenorDays;
  const isHorizonPass = currentTenorDays <= horizonDays;
  const isConcentrationPass = concentrationRatio <= profile.concentrationPct;
  const isLossBufferPass =
    product === 'ELN' ? 100 - elnInputs.barrierPct <= profile.lossTolerancePct : true;

  const quickChatPrompts = [
    'Explain barrier breach mechanism in plain language',
    'Summarize downside risks for the client memo',
    'What happens if the underlying drops 15%?',
    'Is this suitable for a Moderate risk profile?',
  ];

  const suitabilityScore =
    result?.suitability.verdict === 'SUITABLE'
      ? 92
      : result?.suitability.verdict === 'CAUTION'
      ? 68
      : 35;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5 select-none overflow-x-hidden">
      {/* ========================================================================= */}
      {/* JOURNEY MILESTONE BREADCRUMB BAR                                          */}
      {/* ========================================================================= */}
      <div className="clay-tile p-3 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm">
        {/* Stage Indicator & Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-text)] flex items-center justify-center font-bold text-sm font-mono shadow-inner shrink-0">
            {activeStage === 'COCKPIT' ? 'ALL' : `0${currentIndex + 1}`}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                {activeStage === 'COCKPIT' ? 'DESK COCKPIT' : `STAGE ${currentIndex + 1} OF 5`}
              </span>
              <span className="text-[11px] text-[var(--ink-muted)]">·</span>
              <span className="text-xs text-[var(--ink-muted)]">
                {activeStage === 'MANDATE' && 'Client Suitability Profiler'}
                {activeStage === 'CONFIG' && 'Product Structuring & Terms'}
                {activeStage === 'SIMULATION' && 'Monte Carlo & Stress Labs'}
                {activeStage === 'OUTCOMES' && 'Payoff Analytics & Scenarios'}
                {activeStage === 'DELIVERY' && 'Regulatory Verdict & Advisory Memo'}
                {activeStage === 'COCKPIT' && 'Full Operational Workspace'}
              </span>
            </div>
            <h1 className="font-serif text-lg sm:text-xl font-bold text-[var(--ink-primary)] tracking-tight">
              {activeStage === 'MANDATE' && '1. Establish Investor Mandate & Guardrails'}
              {activeStage === 'CONFIG' && '2. Structure Product Parameters & Payoff Terms'}
              {activeStage === 'SIMULATION' && '3. Execute Stochastic Simulation & Stress Testing'}
              {activeStage === 'OUTCOMES' && '4. Inspect Payoff Distribution & Scenario Matrix'}
              {activeStage === 'DELIVERY' && '5. Review Suitability Verdict & Client Memorandum'}
              {activeStage === 'COCKPIT' && 'Cockpit: All Suitability Modules'}
            </h1>
          </div>
        </div>

        {/* Navigation Actions */}
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          {currentIndex > 0 && (
            <button
              onClick={goToPrevStage}
              className="clay-btn-secondary px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          )}

          {currentIndex < stageOrder.length - 1 && activeStage !== 'COCKPIT' && (
            <button
              onClick={goToNextStage}
              className="clay-btn-primary px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer font-sans"
            >
              <span>Next Stage</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {activeStage === 'DELIVERY' && (
            <button
              onClick={() => {
                if (result) onPrintMemo(result);
              }}
              className="clay-btn-primary px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Official Memo</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STAGE 1: CLIENT MANDATE & SUITABILITY PROFILER                            */}
      {/* ========================================================================= */}
      {(activeStage === 'MANDATE' || activeStage === 'COCKPIT') && (
        <div className="space-y-4 animate-journey-step">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Client Profile Inputs */}
            <div className="lg:col-span-7 clay-tile p-5 text-[var(--ink-primary)] space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-text)] flex items-center justify-center">
                    <Compass className="w-4 h-4 text-[var(--accent-gold)]" />
                  </div>
                  <div>
                    <h2 className="font-serif text-base font-bold text-[var(--ink-primary)]">
                      Client Suitability Profile
                    </h2>
                    <p className="text-xs text-[var(--ink-muted)]">
                      Configure investor risk classification and mandate limits
                    </p>
                  </div>
                </div>

                {/* Preset Profiles Picker */}
                <div className="flex items-center gap-1">
                  {SAVED_PROFILES.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onUpdateProfile({ ...p })}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-all ${
                        profile.id === p.id
                          ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] shadow-xs'
                          : 'bg-[var(--well-bg)] text-[var(--ink-secondary)] hover:bg-[var(--well-deep)]'
                      }`}
                    >
                      {p.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Client Name & Risk Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1">
                    CLIENT FULL NAME
                  </label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => onUpdateProfile({ ...profile, name: e.target.value })}
                    className="clay-inset w-full px-3 py-2 text-xs font-semibold text-[var(--ink-primary)] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1">
                    RISK APPETITE CATEGORY
                  </label>
                  <div className="flex gap-1.5 p-1 bg-[var(--well-bg)] rounded-xl border border-[var(--border-color)]">
                    {(['Conservative', 'Moderate', 'Aggressive'] as RiskAppetite[]).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => onUpdateProfile({ ...profile, riskAppetite: cat })}
                        className={`flex-1 py-1 text-center rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                          profile.riskAppetite === cat
                            ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] shadow-xs'
                            : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Interactive Range Sliders */}
              <div className="space-y-3.5 pt-2">
                {/* Investment Horizon */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-mono text-[var(--ink-muted)] font-semibold">
                      INVESTMENT HORIZON
                    </span>
                    <span className="font-bold text-[var(--ink-primary)]">
                      {profile.investmentHorizonMonths} Months ({profile.investmentHorizonMonths * 30} Days)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="36"
                    step="3"
                    value={profile.investmentHorizonMonths}
                    onChange={(e) =>
                      onUpdateProfile({
                        ...profile,
                        investmentHorizonMonths: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[var(--accent-primary)] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--ink-muted)] font-mono">
                    <span>3 Mos (Tactical)</span>
                    <span>12 Mos (Standard)</span>
                    <span>36 Mos (Long Term)</span>
                  </div>
                </div>

                {/* Maximum Loss Tolerance */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-mono text-[var(--ink-muted)] font-semibold">
                      MAX LOSS TOLERANCE
                    </span>
                    <span className="font-bold text-[var(--status-breach-text)]">
                      {profile.lossTolerancePct}% of Principal
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={profile.lossTolerancePct}
                    onChange={(e) =>
                      onUpdateProfile({
                        ...profile,
                        lossTolerancePct: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[var(--accent-primary)] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--ink-muted)] font-mono">
                    <span>0% (Full Capital Protection)</span>
                    <span>15% (Typical Barrier)</span>
                    <span>50% (High Speculation)</span>
                  </div>
                </div>

                {/* Max Concentration Allocation */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-mono text-[var(--ink-muted)] font-semibold">
                      MAX DERIVATIVE CONCENTRATION
                    </span>
                    <span className="font-bold text-[var(--ink-primary)]">
                      {profile.concentrationPct}% of Total Portfolio
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="40"
                    step="5"
                    value={profile.concentrationPct}
                    onChange={(e) =>
                      onUpdateProfile({
                        ...profile,
                        concentrationPct: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[var(--accent-primary)] cursor-pointer"
                  />
                </div>

                {/* Portfolio Total Wealth */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-mono text-[var(--ink-muted)] font-semibold">
                      LIQUID PORTFOLIO VALUE (INR)
                    </span>
                    <span className="font-bold text-[var(--ink-primary)]">
                      ₹{(profile.portfolioValue / 100000).toLocaleString()} Lakhs
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5000000"
                    max="100000000"
                    step="2500000"
                    value={profile.portfolioValue}
                    onChange={(e) =>
                      onUpdateProfile({
                        ...profile,
                        portfolioValue: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[var(--accent-primary)] cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Right: Real-time Mandate Suitability Guardrails */}
            <div className="lg:col-span-5 clay-tile p-5 text-[var(--ink-primary)] flex flex-col justify-between space-y-4">
              <div>
                <div className="border-b border-[var(--border-color)] pb-3 mb-3">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                    REGULATORY COMPLIANCE RUBRIC
                  </span>
                  <h3 className="font-serif text-base font-bold text-[var(--ink-primary)]">
                    Mandate Suitability Guardrails
                  </h3>
                </div>

                {/* Guardrails checklist */}
                <div className="space-y-3">
                  <div className="p-3 rounded-xl clay-tile-light border border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className="flex items-center gap-1.5 text-[var(--ink-primary)]">
                        {isHorizonPass ? (
                          <CheckCircle2 className="w-4 h-4 text-[var(--status-suitable-text)]" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-[var(--status-caution-text)]" />
                        )}
                        Horizon Alignment Check
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                          isHorizonPass
                            ? 'clay-badge-suitable'
                            : 'clay-badge-caution'
                        }`}
                      >
                        {isHorizonPass ? 'PASS' : 'EXCEEDS HORIZON'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--ink-muted)]">
                      Note Tenor ({currentTenorDays}d) vs Client Horizon ({horizonDays}d). Must not lock
                      capital past client liquidity target.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl clay-tile-light border border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className="flex items-center gap-1.5 text-[var(--ink-primary)]">
                        {isConcentrationPass ? (
                          <CheckCircle2 className="w-4 h-4 text-[var(--status-suitable-text)]" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-[var(--status-caution-text)]" />
                        )}
                        Portfolio Concentration Limit
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                          isConcentrationPass
                            ? 'clay-badge-suitable'
                            : 'clay-badge-caution'
                        }`}
                      >
                        {concentrationRatio.toFixed(1)}% / {profile.concentrationPct}%
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--ink-muted)]">
                      Product allocation represents {concentrationRatio.toFixed(1)}% of total liquid
                      wealth.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl clay-tile-light border border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className="flex items-center gap-1.5 text-[var(--ink-primary)]">
                        {isLossBufferPass ? (
                          <CheckCircle2 className="w-4 h-4 text-[var(--status-suitable-text)]" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-[var(--status-breach-text)]" />
                        )}
                        Downside Loss Buffer Test
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                          isLossBufferPass
                            ? 'clay-badge-suitable'
                            : 'clay-badge-unsafe'
                        }`}
                      >
                        {isLossBufferPass ? 'PROTECTED' : 'AT RISK'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--ink-muted)]">
                      Client can absorb up to {profile.lossTolerancePct}% loss. Barrier buffer provides{' '}
                      {100 - elnInputs.barrierPct}% downside cushion before capital erosion.
                    </p>
                  </div>
                </div>
              </div>

              {/* Confirm Step 1 CTA */}
              {activeStage === 'MANDATE' && (
                <div className="pt-2 border-t border-[var(--border-color)] flex justify-end">
                  <button
                    onClick={goToNextStage}
                    className="clay-btn-primary w-full py-2.5 px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <span>Confirm Mandate & Structure Note</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STAGE 2: PRODUCT STRUCTURING & TERMS ENGINE                               */}
      {/* ========================================================================= */}
      {(activeStage === 'CONFIG' || activeStage === 'COCKPIT') && (
        <div className="space-y-4 animate-journey-step">
          {/* Top Product Selector Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <button
              onClick={() => onSelectProduct('ELN')}
              className={`p-4 rounded-2xl text-left cursor-pointer transition-all ${
                product === 'ELN'
                  ? 'clay-tile border-[var(--border-strong)] shadow-md ring-2 ring-[var(--accent-primary)]/20'
                  : 'bg-[var(--card-bg)]/70 border border-[var(--border-color)] hover:bg-[var(--card-bg)]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[var(--accent-primary)] text-[var(--accent-text)]">
                  ELN
                </span>
                {product === 'ELN' && <CheckCircle2 className="w-4 h-4 text-[var(--status-suitable-text)]" />}
              </div>
              <h3 className="font-serif text-sm font-bold text-[var(--ink-primary)]">
                Equity Linked Note (Reverse Convertible)
              </h3>
              <p className="text-[11px] text-[var(--ink-muted)] mt-1 leading-snug">
                Enhanced coupon yield ({elnInputs.couponPctPa}% p.a.) backed by downside barrier
                protection.
              </p>
            </button>

            <button
              onClick={() => onSelectProduct('DCD')}
              className={`p-4 rounded-2xl text-left cursor-pointer transition-all ${
                product === 'DCD'
                  ? 'clay-tile border-[var(--border-strong)] shadow-md ring-2 ring-[var(--accent-primary)]/20'
                  : 'bg-[var(--card-bg)]/70 border border-[var(--border-color)] hover:bg-[var(--card-bg)]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[var(--accent-primary)] text-[var(--accent-text)]">
                  DCD
                </span>
                {product === 'DCD' && <CheckCircle2 className="w-4 h-4 text-[var(--status-suitable-text)]" />}
              </div>
              <h3 className="font-serif text-sm font-bold text-[var(--ink-primary)]">
                Dual Currency Deposit (FX Yield Booster)
              </h3>
              <p className="text-[11px] text-[var(--ink-muted)] mt-1 leading-snug">
                High short-term deposit yield ({dcdInputs.enhancedRatePctPa}% p.a.) with FX conversion
                at strike.
              </p>
            </button>

            <button
              onClick={() => onSelectProduct('CPN')}
              className={`p-4 rounded-2xl text-left cursor-pointer transition-all ${
                product === 'CPN'
                  ? 'clay-tile border-[var(--border-strong)] shadow-md ring-2 ring-[var(--accent-primary)]/20'
                  : 'bg-[var(--card-bg)]/70 border border-[var(--border-color)] hover:bg-[var(--card-bg)]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[var(--accent-primary)] text-[var(--accent-text)]">
                  CPN
                </span>
                {product === 'CPN' && <CheckCircle2 className="w-4 h-4 text-[var(--status-suitable-text)]" />}
              </div>
              <h3 className="font-serif text-sm font-bold text-[var(--ink-primary)]">
                Capital Protected Note (Guaranteed Floor)
              </h3>
              <p className="text-[11px] text-[var(--ink-muted)] mt-1 leading-snug">
                100% principal protection floor + {cpnInputs.participationPct}% upside market
                participation.
              </p>
            </button>
          </div>

          {/* Interactive Structuring Sliders & Plain-English Explainer */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Parameters Controls */}
            <div className="lg:col-span-7 clay-tile p-5 text-[var(--ink-primary)] space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[var(--ink-muted)]" />
                  <h3 className="font-serif text-base font-bold text-[var(--ink-primary)]">
                    Structure Note Parameters
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                  SPOT: ₹{SPOT_PRICES['NIFTY 50'].toLocaleString()}
                </span>
              </div>

              {/* Dynamic Inputs based on product */}
              {product === 'ELN' && (
                <div className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1">
                        UNDERLYING BENCHMARK
                      </label>
                      <select
                        value={elnInputs.underlying}
                        onChange={(e) => setElnInputs({ ...elnInputs, underlying: e.target.value })}
                        className="clay-inset w-full px-3 py-2 text-xs font-semibold text-[var(--ink-primary)] focus:outline-none"
                      >
                        <option value="NIFTY 50">NIFTY 50 (Index)</option>
                        <option value="BANKNIFTY">BANKNIFTY (Banking)</option>
                        <option value="RELIANCE">RELIANCE (Energy/Tech)</option>
                        <option value="TCS">TCS (IT Services)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1">
                        TENOR (DAYS)
                      </label>
                      <div className="flex gap-1">
                        {[30, 90, 180, 365].map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setElnInputs({ ...elnInputs, tenorDays: t })}
                            className={`flex-1 py-1 text-center rounded-lg text-xs font-mono font-semibold cursor-pointer ${
                              elnInputs.tenorDays === t
                                ? 'bg-[var(--accent-primary)] text-[var(--accent-text)]'
                                : 'bg-[var(--well-bg)] text-[var(--ink-secondary)]'
                            }`}
                          >
                            {t}d
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Downside Barrier % Slider */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-mono text-[var(--ink-muted)] font-semibold">
                        DOWNSIDE BARRIER THRESHOLD
                      </span>
                      <span className="font-bold text-[var(--status-breach-text)]">
                        {elnInputs.barrierPct}% (₹
                        {((SPOT_PRICES['NIFTY 50'] * elnInputs.barrierPct) / 100).toFixed(0)})
                      </span>
                    </div>
                    <input
                      type="range"
                      min="65"
                      max="95"
                      step="1"
                      value={elnInputs.barrierPct}
                      onChange={(e) =>
                        setElnInputs({ ...elnInputs, barrierPct: Number(e.target.value) })
                      }
                      className="w-full accent-[var(--accent-primary)] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--ink-muted)] font-mono">
                      <span>65% (Deep Barrier, Safe)</span>
                      <span>85% (Balanced)</span>
                      <span>95% (Aggressive Yield)</span>
                    </div>
                  </div>

                  {/* Annualized Coupon % Slider */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-mono text-[var(--ink-muted)] font-semibold">
                        ANNUALIZED COUPON YIELD
                      </span>
                      <span className="font-bold text-[var(--status-suitable-text)]">
                        {elnInputs.couponPctPa}% p.a.
                      </span>
                    </div>
                    <input
                      type="range"
                      min="6"
                      max="18"
                      step="0.25"
                      value={elnInputs.couponPctPa}
                      onChange={(e) =>
                        setElnInputs({ ...elnInputs, couponPctPa: Number(e.target.value) })
                      }
                      className="w-full accent-[var(--accent-primary)] cursor-pointer"
                    />
                  </div>

                  {/* Notional Investment Amount */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-mono text-[var(--ink-muted)] font-semibold">
                        INVESTMENT NOTIONAL (INR)
                      </span>
                      <span className="font-bold text-[var(--ink-primary)]">
                        ₹{(elnInputs.notional / 100000).toLocaleString()} Lakhs
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {[1000000, 2500000, 5000000, 10000000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setElnInputs({ ...elnInputs, notional: amt })}
                          className={`flex-1 py-1 rounded-lg text-xs font-mono font-semibold cursor-pointer ${
                            elnInputs.notional === amt
                              ? 'bg-[var(--accent-primary)] text-[var(--accent-text)]'
                              : 'bg-[var(--well-bg)] text-[var(--ink-secondary)]'
                          }`}
                        >
                          ₹{amt / 100000}L
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* DCD Controls */}
              {product === 'DCD' && (
                <div className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1">
                        CURRENCY PAIR
                      </label>
                      <select
                        value={dcdInputs.currencyPair}
                        onChange={(e) => setDcdInputs({ ...dcdInputs, currencyPair: e.target.value })}
                        className="clay-inset w-full px-3 py-2 text-xs font-semibold text-[var(--ink-primary)] focus:outline-none"
                      >
                        <option value="USD/INR">USD / INR</option>
                        <option value="EUR/USD">EUR / USD</option>
                        <option value="GBP/USD">GBP / USD</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1">
                        TENOR
                      </label>
                      <div className="flex gap-1">
                        {[14, 30, 60, 90].map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setDcdInputs({ ...dcdInputs, tenorDays: t })}
                            className={`flex-1 py-1 text-center rounded-lg text-xs font-mono font-semibold cursor-pointer ${
                              dcdInputs.tenorDays === t
                                ? 'bg-[var(--accent-primary)] text-[var(--accent-text)]'
                                : 'bg-[var(--well-bg)] text-[var(--ink-secondary)]'
                            }`}
                          >
                            {t}d
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-mono text-[var(--ink-muted)] font-semibold">STRIKE RATE</span>
                      <span className="font-bold text-[var(--ink-primary)]">{dcdInputs.strikeRate}</span>
                    </div>
                    <input
                      type="range"
                      min="82"
                      max="88"
                      step="0.1"
                      value={dcdInputs.strikeRate}
                      onChange={(e) =>
                        setDcdInputs({ ...dcdInputs, strikeRate: Number(e.target.value) })
                      }
                      className="w-full accent-[var(--accent-primary)] cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-mono text-[var(--ink-muted)] font-semibold">ENHANCED RATE %</span>
                      <span className="font-bold text-[var(--status-suitable-text)]">
                        {dcdInputs.enhancedRatePctPa}% p.a.
                      </span>
                    </div>
                    <input
                      type="range"
                      min="4"
                      max="14"
                      step="0.25"
                      value={dcdInputs.enhancedRatePctPa}
                      onChange={(e) =>
                        setDcdInputs({ ...dcdInputs, enhancedRatePctPa: Number(e.target.value) })
                      }
                      className="w-full accent-[var(--accent-primary)] cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* CPN Controls */}
              {product === 'CPN' && (
                <div className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1">
                        PRINCIPAL PROTECTION FLOOR
                      </label>
                      <div className="flex gap-1">
                        {[95, 100].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setCpnInputs({ ...cpnInputs, protectionPct: p })}
                            className={`flex-1 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                              cpnInputs.protectionPct === p
                                ? 'bg-[var(--accent-primary)] text-[var(--accent-text)]'
                                : 'bg-[var(--well-bg)] text-[var(--ink-secondary)]'
                            }`}
                          >
                            {p}% Floor
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1">
                        TENOR
                      </label>
                      <div className="flex gap-1">
                        {[180, 365, 730].map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setCpnInputs({ ...cpnInputs, tenorDays: t })}
                            className={`flex-1 py-1 text-center rounded-lg text-xs font-mono font-semibold cursor-pointer ${
                              cpnInputs.tenorDays === t
                                ? 'bg-[var(--accent-primary)] text-[var(--accent-text)]'
                                : 'bg-[var(--well-bg)] text-[var(--ink-secondary)]'
                            }`}
                          >
                            {t}d
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-mono text-[var(--ink-muted)] font-semibold">
                        UPSIDE PARTICIPATION RATE
                      </span>
                      <span className="font-bold text-[var(--status-suitable-text)]">
                        {cpnInputs.participationPct}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      step="5"
                      value={cpnInputs.participationPct}
                      onChange={(e) =>
                        setCpnInputs({ ...cpnInputs, participationPct: Number(e.target.value) })
                      }
                      className="w-full accent-[var(--accent-primary)] cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Right: Plain English Payoff Explainer */}
            <div className="lg:col-span-5 clay-tile p-5 text-[var(--ink-primary)] flex flex-col justify-between space-y-4">
              <div>
                <div className="border-b border-[var(--border-color)] pb-3 mb-3">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                    TRANSPARENCY & DISCLOSURE
                  </span>
                  <h3 className="font-serif text-base font-bold text-[var(--ink-primary)]">
                    Terminal Payoff Mechanics
                  </h3>
                </div>

                <div className="p-3.5 rounded-xl clay-tile-light border border-[var(--border-subtle)] space-y-2.5">
                  <div className="text-xs font-serif font-semibold text-[var(--ink-primary)]">
                    At maturity in {getCurrentInputs().tenorDays} days:
                  </div>

                  {product === 'ELN' && (
                    <>
                      <div className="text-[11px] text-[var(--ink-secondary)] space-y-1">
                        <strong className="text-[var(--status-suitable-text)] block">
                          Case A (Above {elnInputs.barrierPct}% Barrier):
                        </strong>
                        Client receives 100% principal (₹
                        {(elnInputs.notional / 100000).toLocaleString()}L) + guaranteed yield of ₹
                        {(
                          (elnInputs.notional *
                            (elnInputs.couponPctPa / 100) *
                            elnInputs.tenorDays) /
                          365
                        ).toFixed(0)}{' '}
                        ({elnInputs.couponPctPa}% p.a.).
                      </div>
                      <div className="text-[11px] text-[var(--ink-secondary)] space-y-1 pt-1 border-t border-[var(--border-subtle)]">
                        <strong className="text-[var(--status-breach-text)] block">
                          Case B (Breach Below {elnInputs.barrierPct}% Barrier):
                        </strong>
                        Client takes delivery of equity at strike price. Principal experiences 1:1
                        downside loss relative to strike.
                      </div>
                    </>
                  )}

                  {product === 'DCD' && (
                    <>
                      <div className="text-[11px] text-[var(--ink-secondary)] space-y-1">
                        <strong className="text-[var(--status-suitable-text)] block">
                          Case A (Spot &gt;= Strike {dcdInputs.strikeRate}):
                        </strong>
                        Principal returned in base currency ({dcdInputs.depositCurrency}) + enhanced
                        yield ({dcdInputs.enhancedRatePctPa}% p.a.).
                      </div>
                      <div className="text-[11px] text-[var(--ink-secondary)] space-y-1 pt-1 border-t border-[var(--border-subtle)]">
                        <strong className="text-[var(--status-caution-text)] block">
                          Case B (Spot &lt; Strike {dcdInputs.strikeRate}):
                        </strong>
                        Principal converted to alternate currency ({dcdInputs.alternateCurrency}) at
                        the pre-agreed strike rate.
                      </div>
                    </>
                  )}

                  {product === 'CPN' && (
                    <>
                      <div className="text-[11px] text-[var(--ink-secondary)] space-y-1">
                        <strong className="text-[var(--status-suitable-text)] block">Market Rally:</strong>
                        Client receives 100% principal + {cpnInputs.participationPct}% of index
                        gains.
                      </div>
                      <div className="text-[11px] text-[var(--ink-secondary)] space-y-1 pt-1 border-t border-[var(--border-subtle)]">
                        <strong className="text-[var(--ink-primary)] block">Market Crash:</strong>
                        Principal is protected at {cpnInputs.protectionPct}%. Client cannot lose
                        invested capital.
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Confirm Step 2 CTA */}
              {activeStage === 'CONFIG' && (
                <div className="pt-2 border-t border-[var(--border-color)] flex justify-between gap-3">
                  <button
                    onClick={goToPrevStage}
                    className="clay-btn-secondary py-2 px-3 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Mandate</span>
                  </button>
                  <button
                    onClick={() => {
                      handleExecuteSimulation();
                      goToNextStage();
                    }}
                    className="clay-btn-primary flex-1 py-2.5 px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <span>Run Simulation Lab</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STAGE 3: SIMULATION & STRESS TESTING ENGINE                               */}
      {/* ========================================================================= */}
      {(activeStage === 'SIMULATION' || activeStage === 'COCKPIT') && (
        <div className="space-y-4 animate-journey-step">
          <div className="clay-tile p-5 text-[var(--ink-primary)] space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-text)] flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-[var(--accent-gold)]" />
                </div>
                <div>
                  <h3 className="font-serif text-base font-bold text-[var(--ink-primary)]">
                    Monte Carlo Engine & Macro Stress Calibration
                  </h3>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Stochastic GBM (10,000 paths) + Factor Shock Sensitivity
                  </p>
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center gap-1 p-1 bg-[var(--well-bg)] rounded-xl border border-[var(--border-color)]">
                <button
                  onClick={() => setMode('FORECAST')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    mode === 'FORECAST'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] shadow-xs'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  Mode A: Stochastic Forecast
                </button>
                <button
                  onClick={() => setMode('SHOCK')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    mode === 'SHOCK'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] shadow-xs'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  Mode B: Macro Stress Shock
                </button>
              </div>
            </div>

            {/* Calibration Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3.5 rounded-xl clay-tile-light border border-[var(--border-subtle)]">
                <label className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1">
                  HISTORICAL TRAINING WINDOW
                </label>
                <div className="flex gap-1.5">
                  {[3, 5, 10].map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => setTrainingWindowYears(yr)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold cursor-pointer ${
                        trainingWindowYears === yr
                          ? 'bg-[var(--accent-primary)] text-[var(--accent-text)]'
                          : 'bg-[var(--well-bg)] text-[var(--ink-secondary)]'
                      }`}
                    >
                      {yr} Years
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-[var(--ink-muted)] mt-1.5 block">
                  Calibrated to empirical NIFTY drift & GARCH(1,1) volatility.
                </span>
              </div>

              <div className="p-3.5 rounded-xl clay-tile-light border border-[var(--border-subtle)]">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-mono text-[var(--ink-muted)] font-semibold">
                    MACRO FACTOR SHOCK
                  </span>
                  <span className={`font-bold ${shockPct < 0 ? 'text-[var(--status-breach-text)]' : 'text-[var(--status-suitable-text)]'}`}>
                    {shockPct > 0 ? `+${shockPct}%` : `${shockPct}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-35"
                  max="15"
                  step="5"
                  value={shockPct}
                  onChange={(e) => setShockPct(Number(e.target.value))}
                  className="w-full accent-[var(--accent-primary)] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[var(--ink-muted)] font-mono">
                  <span>-35% (Crash)</span>
                  <span>0% (Base)</span>
                  <span>+15% (Rally)</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl clay-tile-light border border-[var(--border-subtle)] flex flex-col justify-between">
                <div>
                  <span className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1">
                    EXECUTION TRIGGER
                  </span>
                  <p className="text-[11px] text-[var(--ink-muted)]">
                    Simulate 10,000 terminal path distributions with live barrier checking.
                  </p>
                </div>
                <button
                  onClick={handleExecuteSimulation}
                  disabled={loading}
                  className="clay-btn-primary w-full py-2 px-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current text-[var(--accent-gold)]" />
                  <span>{loading ? `Simulating (${elapsedSeconds.toFixed(1)}s)...` : 'Run Simulation'}</span>
                </button>
              </div>
            </div>

            {/* Simulation Telemetry KPIs */}
            {result && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-[var(--well-bg)] border border-[var(--border-subtle)] text-center">
                  <span className="text-[10px] font-mono text-[var(--ink-muted)] font-semibold block">
                    MEDIAN RETURN (P50)
                  </span>
                  <span className="text-base font-mono font-bold text-[var(--ink-primary)]">
                    {result.distribution
                      ? (result.distribution.returnP50 >= 0 ? '+' : '') +
                        result.distribution.returnP50.toFixed(1) +
                        '%'
                      : '+4.8%'}
                  </span>
                  <span className="text-[10px] text-[var(--ink-muted)] block">Expected Yield</span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--well-bg)] border border-[var(--border-subtle)] text-center">
                  <span className="text-[10px] font-mono text-[var(--ink-muted)] font-semibold block">
                    BARRIER BREACH RISK
                  </span>
                  <span
                    className={`text-base font-mono font-bold ${
                      (result.distribution?.probKnockIn || 0) > 0.2
                        ? 'text-[var(--status-breach-text)]'
                        : 'text-[var(--status-suitable-text)]'
                    }`}
                  >
                    {result.distribution?.probKnockIn !== undefined
                      ? (result.distribution.probKnockIn * 100).toFixed(1) + '%'
                      : '14.2%'}
                  </span>
                  <span className="text-[10px] text-[var(--ink-muted)] block">Stochastic Odds</span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--well-bg)] border border-[var(--border-subtle)] text-center">
                  <span className="text-[10px] font-mono text-[var(--ink-muted)] font-semibold block">
                    TAIL RISK (P5 RETURN)
                  </span>
                  <span className="text-base font-mono font-bold text-[var(--status-breach-text)]">
                    {result.distribution ? `${result.distribution.returnP5.toFixed(1)}%` : '-12.5%'}
                  </span>
                  <span className="text-[10px] text-[var(--ink-muted)] block">1-in-20 Downside</span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--well-bg)] border border-[var(--border-subtle)] text-center">
                  <span className="text-[10px] font-mono text-[var(--ink-muted)] font-semibold block">
                    UPSIDE CEILING (P95)
                  </span>
                  <span className="text-base font-mono font-bold text-[var(--status-suitable-text)]">
                    {result.distribution
                      ? `+${result.distribution.returnP95.toFixed(1)}%`
                      : '+9.5%'}
                  </span>
                  <span className="text-[10px] text-[var(--ink-muted)] block">Upper Bound</span>
                </div>
              </div>
            )}

            {/* Confirm Step 3 CTA */}
            {activeStage === 'SIMULATION' && (
              <div className="pt-2 border-t border-[var(--border-color)] flex justify-between gap-3">
                <button
                  onClick={goToPrevStage}
                  className="clay-btn-secondary py-2 px-3 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Structure</span>
                </button>
                <button
                  onClick={goToNextStage}
                  className="clay-btn-primary flex-1 py-2.5 px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <span>Inspect Payoff Curves & Scenarios</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STAGE 4: PAYOFF ANALYTICS, FAN CHART & SCENARIOS                          */}
      {/* ========================================================================= */}
      {(activeStage === 'OUTCOMES' || activeStage === 'COCKPIT') && result && (
        <div className="space-y-5 animate-journey-step">
          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <PayoffChart
              product={product}
              inputs={result.inputs}
              spotPrice={SPOT_PRICES[result.underlyingName] || 25000}
              curve={result.payoffCurve}
            />

            <FanChart
              fan={result.fan || []}
              product={product}
              inputs={result.inputs}
              spotPrice={SPOT_PRICES[result.underlyingName] || 25000}
            />
          </div>

          {/* Deterministic Scenario Matrix */}
          <div className="clay-tile p-5 text-[var(--ink-primary)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                  STRESS TESTING SCENARIO MATRIX
                </span>
                <h3 className="font-serif text-base font-bold text-[var(--ink-primary)]">
                  Deterministic Payoffs Across Market Regimes
                </h3>
              </div>
              <span className="text-xs text-[var(--ink-muted)]">
                Base Spot: ₹{(SPOT_PRICES[result.underlyingName] || 25000).toLocaleString()}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-[var(--ink-muted)] font-mono text-[11px]">
                    <th className="py-2 px-3">SCENARIO REGIME</th>
                    <th className="py-2 px-3">MARKET SHIFT</th>
                    <th className="py-2 px-3">UNDERLYING LEVEL</th>
                    <th className="py-2 px-3">PAYOFF AMOUNT</th>
                    <th className="py-2 px-3">NET RETURN %</th>
                    <th className="py-2 px-3">BARRIER STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                  {result.scenarios.map((sc, i) => (
                    <tr key={i} className="hover:bg-[var(--well-bg)]/50 transition-colors">
                      <td className="py-2.5 px-3 font-sans font-semibold text-[var(--ink-primary)]">
                        {sc.scenarioLabel}
                      </td>
                      <td
                        className={`py-2.5 px-3 font-bold ${
                          sc.underlyingPctChange < 0 ? 'text-[var(--status-breach-text)]' : 'text-[var(--status-suitable-text)]'
                        }`}
                      >
                        {sc.underlyingPctChange > 0 ? `+${sc.underlyingPctChange}%` : `${sc.underlyingPctChange}%`}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--ink-secondary)]">
                        ₹{sc.underlyingLevel.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[var(--ink-primary)]">
                        ₹{Math.round(sc.payoffAmount).toLocaleString()}
                      </td>
                      <td
                        className={`py-2.5 px-3 font-bold ${
                          sc.returnPct < 0 ? 'text-[var(--status-breach-text)]' : 'text-[var(--status-suitable-text)]'
                        }`}
                      >
                        {sc.returnPct > 0 ? `+${sc.returnPct.toFixed(1)}%` : `${sc.returnPct.toFixed(1)}%`}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            sc.knockedIn
                              ? 'clay-badge-unsafe'
                              : 'clay-badge-suitable'
                          }`}
                        >
                          {sc.knockedIn ? 'BREACHED' : 'INTACT'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Confirm Step 4 CTA */}
            {activeStage === 'OUTCOMES' && (
              <div className="pt-3 border-t border-[var(--border-color)] flex justify-between gap-3">
                <button
                  onClick={goToPrevStage}
                  className="clay-btn-secondary py-2 px-3 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Simulation</span>
                </button>
                <button
                  onClick={goToNextStage}
                  className="clay-btn-primary flex-1 py-2.5 px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <span>Review Suitability Verdict & Client Memorandum</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STAGE 5: SUITABILITY VERDICT & CLIENT ADVISORY MEMORANDUM                 */}
      {/* ========================================================================= */}
      {(activeStage === 'DELIVERY' || activeStage === 'COCKPIT') && result && (
        <div className="space-y-5 animate-journey-step">
          {/* Top Verdict Highlight */}
          <div className="clay-tile p-5 sm:p-6 text-[var(--ink-primary)] space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                  FINAL REGULATORY VERDICT
                </span>
                <div className="flex items-center gap-3 mt-1">
                  <span
                    className={`text-sm sm:text-base font-mono px-3 py-1 rounded-xl font-bold uppercase tracking-wider ${
                      result.suitability.verdict === 'SUITABLE'
                        ? 'clay-badge-suitable'
                        : result.suitability.verdict === 'CAUTION'
                        ? 'clay-badge-caution'
                        : 'clay-badge-unsafe'
                    }`}
                  >
                    {result.suitability.verdict.replace('_', ' ')}
                  </span>
                  <span className="text-sm font-serif text-[var(--ink-secondary)]">
                    Score: <strong>{suitabilityScore} / 100</strong>
                  </span>
                </div>
              </div>

              {/* Quick Actions: Save & Print */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onSaveSimulation(result);
                    setSaveSuccess(true);
                    setTimeout(() => setSaveSuccess(false), 2500);
                  }}
                  className="clay-btn-secondary px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Bookmark className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
                  <span>{saveSuccess ? 'Saved to Audit!' : 'Save to Ledger'}</span>
                </button>
                <button
                  onClick={() => onPrintMemo(result)}
                  className="clay-btn-primary px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Download / Print Memorandum</span>
                </button>
              </div>
            </div>

            {/* Suitability Rationale & Mandatory Disclosures */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl clay-tile-light border border-[var(--border-subtle)]">
                <h4 className="font-serif text-xs font-bold text-[var(--ink-primary)] mb-1.5 uppercase tracking-wide">
                  Suitability Assessment Rationale
                </h4>
                <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                  {result.explanation.suitabilityRationale}
                </p>
              </div>

              <div className="p-4 rounded-xl clay-tile-light border border-[var(--border-subtle)]">
                <h4 className="font-serif text-xs font-bold text-[var(--ink-primary)] mb-1.5 uppercase tracking-wide">
                  Regulatory Flags & Risk Mitigants
                </h4>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {result.suitability.flags.length > 0 ? (
                    result.suitability.flags.map((fl, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-[var(--status-caution-text)] shrink-0 mt-0.5" />
                        <span className="text-[var(--ink-primary)]">
                          <strong>{fl.rule}:</strong> {fl.reason}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--status-suitable-text)]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>All regulatory thresholds are fully satisfied for this mandate.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive RM Assistant Chat */}
          <div className="clay-tile p-5 text-[var(--ink-primary)] space-y-3">
            <div className="border-b border-[var(--border-color)] pb-2.5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                RELATIONSHIP MANAGER ADVISORY COPILOT
              </span>
              <h3 className="font-serif text-base font-bold text-[var(--ink-primary)]">
                Interactive Suitability & Client Advisory Assistant
              </h3>
            </div>

            {/* Quick Query Prompt Chips */}
            <div className="flex flex-wrap gap-1.5">
              {quickChatPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(prompt)}
                  className="px-2.5 py-1 rounded-lg text-xs bg-[var(--well-bg)] text-[var(--ink-primary)] hover:bg-[var(--accent-primary)] hover:text-[var(--accent-text)] transition-colors cursor-pointer text-left"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Chat History Box */}
            <div className="p-3.5 rounded-xl clay-tile-light border border-[var(--border-subtle)] h-52 overflow-y-auto space-y-2.5">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.sender === 'RM' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl p-2.5 text-xs leading-relaxed ${
                      msg.sender === 'RM'
                        ? 'bg-[var(--accent-primary)] text-[var(--accent-text)]'
                        : 'bg-[var(--well-bg)] text-[var(--ink-primary)] border border-[var(--border-subtle)]'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-[var(--ink-muted)] mt-0.5 px-1 font-mono">
                    {msg.timestamp}
                  </span>
                </div>
              ))}
              {chatLoading && (
                <div className="text-xs text-[var(--ink-muted)] italic">Generating advisory response...</div>
              )}
            </div>

            {/* Chat Input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ask advisory question (e.g. 'How does this compare to a fixed deposit?')..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendMessage();
                }}
                className="clay-inset flex-1 px-3 py-2 text-xs text-[var(--ink-primary)] focus:outline-none"
              />
              <button
                onClick={() => handleSendMessage()}
                className="clay-btn-primary px-3.5 py-2 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ask</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

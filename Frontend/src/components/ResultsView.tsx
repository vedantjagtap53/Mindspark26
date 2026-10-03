/**
 * @license
 * Payoff Desk — Structured Products Suitability Simulator
 * High-Visibility Bento Grid Workspace View
 */

import React, { useState } from 'react';
import { SimulationResult, ChatMessage } from '../api/types';
import { PayoffChart } from './charts/PayoffChart';
import { FanChart } from './charts/FanChart';
import { getMockChatReply } from '../api/mock';
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Bookmark,
  Printer,
  FileCheck,
  TrendingDown,
  TrendingUp,
  Activity,
  Send,
  MessageSquare,
  Sparkles,
  Info,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight,
} from 'lucide-react';

interface ResultsViewProps {
  result: SimulationResult | null;
  loading: boolean;
  elapsedSeconds: number;
  onSaveSimulation: (result: SimulationResult) => void;
  onPrintReport: (result: SimulationResult) => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  result,
  loading,
  elapsedSeconds,
  onSaveSimulation,
  onPrintReport,
}) => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-init',
      sender: 'DESK',
      timestamp: '14:12',
      text: 'Compliance analysis complete. You may query breakeven levels, downside risks, tax treatment, or suitability rationale for client documentation.',
    },
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isSaved, setIsSaved] = useState<boolean>(false);

  if (loading) {
    return (
      <div className="h-full min-h-[560px] flex flex-col items-center justify-center p-12 text-center select-none">
        <div className="bento-tile p-8 max-w-md w-full flex flex-col items-center space-y-4 animate-soft-pulse border border-black/10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#8E2836] to-[#60141F] flex items-center justify-center text-white shadow-lg">
            <Activity className="w-7 h-7 animate-spin" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold text-[#111827]">
              Running 10,000 Stochastic Paths
            </h3>
            <p className="text-xs text-[#4B5563] mt-1.5 leading-relaxed font-sans">
              Calibrating fat-tailed Student-t volatility surfaces and evaluating suitability rules against client profile…
            </p>
          </div>
          <div className="w-full bg-[#F3F0E9] p-1.5 rounded-full border border-black/5 overflow-hidden">
            <div className="h-2.5 w-full bg-[#E5E0D5] rounded-full relative overflow-hidden">
              <div className="absolute inset-0 bg-[#7A1F2B] animate-wave-bar rounded-full" />
            </div>
          </div>
          <div className="font-mono text-xs text-[#374151] font-semibold">
            Elapsed calculation time: <strong className="text-[#7A1F2B]">{elapsedSeconds.toFixed(1)}s</strong>
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="h-full min-h-[560px] flex flex-col items-center justify-center p-12 text-center select-none">
        <div className="bento-tile p-10 max-w-md flex flex-col items-center space-y-4 border border-black/10">
          <div className="w-12 h-12 rounded-2xl bg-[#F3F0E9] flex items-center justify-center text-[#4B5563]">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold text-[#111827] mb-1">
              Awaiting Simulation Execution
            </h3>
            <p className="text-xs text-[#4B5563] leading-relaxed font-sans">
              Configure parameters on the left panel, then select &ldquo;Run Simulation&rdquo; to populate the Bento Grid with payoff curves, distribution matrices, and regulatory determinations.
            </p>
          </div>
          <div className="text-[11px] font-mono px-3.5 py-1 rounded-full bg-[#F3F0E9] text-[#374151] font-semibold border border-black/5">
            GARCH(1,1) Standby · NIFTY 50 Reference @ 25,124.50
          </div>
        </div>
      </div>
    );
  }

  const handleSendChat = (textToSend?: string) => {
    const query = textToSend || chatInput;
    if (!query.trim()) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'RM',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: query,
    };

    const replyText = getMockChatReply(query, result);
    const deskMsg: ChatMessage = {
      id: `desk-${Date.now() + 1}`,
      sender: 'DESK',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: replyText,
    };

    setChatMessages((prev) => [...prev, userMsg, deskMsg]);
    setChatInput('');
  };

  const handleSaveClick = () => {
    onSaveSimulation(result);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const isSuitable = result.suitability.verdict === 'SUITABLE';
  const isCaution = result.suitability.verdict === 'CAUTION';

  const verdictTheme = isSuitable
    ? {
        bg: 'bg-[#E8F5E9]',
        border: 'border-[#A5D6A7]',
        text: 'text-[#1B5E20]',
        icon: CheckCircle2,
        label: 'SUITABLE FOR CLIENT',
        desc: 'Transaction satisfies all mandate guidelines, risk tolerances, and concentration ceilings.',
      }
    : isCaution
    ? {
        bg: 'bg-[#FFF8E1]',
        border: 'border-[#FFE082]',
        text: 'text-[#B76E00]',
        icon: AlertTriangle,
        label: 'APPROVED WITH CAUTION',
        desc: 'One or more prudential thresholds exceeded. Documented supervisory consent required.',
      }
    : {
        bg: 'bg-[#FFEBEE]',
        border: 'border-[#FFCDD2]',
        text: 'text-[#B71C1C]',
        icon: XCircle,
        label: 'NOT SUITABLE',
        desc: 'Severe mandate conflict: potential downside loss exceeds client contractual tolerance threshold.',
      };

  const VerdictIcon = verdictTheme.icon;
  const currencySymbol =
    result.product === 'DCD'
      ? (result.inputs as any).depositCurrency
      : (result.inputs as any).currency || 'INR';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5 text-[#111827]">
      {/* BENTO GRID ROW 1: Hero & Suitability Header Strip */}
      <div className="bento-tile p-6 border border-black/10 space-y-4">
        {result.isStale && (
          <div className="p-3 rounded-xl bg-[#FFF8E1] border border-[#FFE082] text-xs font-mono text-[#B76E00] flex items-center justify-between font-semibold">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4" />
              <span>Notice: Market quote data is older than 1 trading day (Simulated Stale Data). Refetch before booking.</span>
            </div>
            <span>[STALE DATA]</span>
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-1.5 flex-1 min-w-[280px]">
            <div className="flex items-center gap-2 text-xs font-mono text-[#4B5563] flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-[#F3F0E9] text-[#111827] font-bold border border-black/5">
                {result.product}
              </span>
              <span>{result.underlyingName}</span>
              <span>·</span>
              <span>{result.inputs.tenorDays} Calendar Days</span>
              <span>·</span>
              <span className="font-semibold text-[#7A1F2B]">
                {result.mode === 'FORECAST' ? 'GARCH Monte Carlo' : 'Manual Shock'}
              </span>
              <span>·</span>
              <span>As of {new Date(result.asOf).toLocaleTimeString()} IST</span>
            </div>

            <h1 className="font-serif text-3xl font-bold tracking-tight text-[#111827]">
              {result.headlineRange}
            </h1>
            <p className="text-xs text-[#4B5563] font-sans">
              Client Mandate: <strong>{result.profile.name}</strong> ({result.profile.riskAppetite} Profile · Max Loss {result.profile.lossTolerancePct.toFixed(1)}%)
            </p>
          </div>

          {/* Large High-Visibility Verdict Badge & Actions */}
          <div className="flex items-center gap-4 flex-wrap">
            <div
              className={`p-4 rounded-2xl border ${verdictTheme.bg} ${verdictTheme.border} flex items-center gap-3.5 shadow-xs`}
            >
              <div className={`p-2 rounded-xl bg-white/80 shadow-xs ${verdictTheme.text}`}>
                <VerdictIcon className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#4B5563]">
                  Suitability Ruling
                </div>
                <div className={`text-base font-bold font-mono tracking-tight ${verdictTheme.text}`}>
                  {verdictTheme.label}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleSaveClick}
                className={`px-4 py-2 text-xs font-mono rounded-xl border flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs ${
                  isSaved
                    ? 'bg-[#E8F5E9] text-[#1B5E20] border-[#A5D6A7] font-bold'
                    : 'bg-white text-[#111827] border-black/15 hover:border-black/30 font-medium'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>{isSaved ? 'Saved to Ledger' : 'Save Record'}</span>
              </button>

              <button
                onClick={() => onPrintReport(result)}
                className="clay-btn-primary px-4 py-2 text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer font-bold shadow-md"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Memo</span>
              </button>
            </div>
          </div>
        </div>

        {/* Observations list inside the header */}
        {result.suitability.flags.length > 0 ? (
          <div className="pt-3 border-t border-black/10 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#374151] block font-sans">
              Compliance Observations & Exceptions ({result.suitability.flags.length}):
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {result.suitability.flags.map((flag, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-[#F8F7F3] border border-black/10 flex items-start gap-2.5 text-xs font-mono"
                >
                  <span
                    className={`px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wider shrink-0 ${
                      flag.severity === 'CRITICAL' ? 'bg-[#B71C1C] text-white' : 'bg-[#B76E00] text-white'
                    }`}
                  >
                    {flag.severity}
                  </span>
                  <div>
                    <strong className="text-[#111827]">{flag.rule}:</strong>{' '}
                    <span className="text-[#374151]">{flag.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="pt-2 border-t border-black/10 text-xs font-mono text-[#1B5E20] flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>All regulatory suitability checks passed: Low case loss aligns with client stop-loss ceiling.</span>
          </div>
        )}
      </div>

      {/* BENTO GRID ROW 2: Payoff Chart (7 Cols) + Scenario Matrix (5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Bento Tile 2: Payoff Curve (7 Cols) */}
        <div className="lg:col-span-7">
          <PayoffChart
            product={result.product}
            inputs={result.inputs}
            spotPrice={result.spotPrice}
            curve={result.payoffCurve}
          />
        </div>

        {/* Bento Tile 3: Scenario Matrix (5 Cols) */}
        <div className="lg:col-span-5 bento-tile p-5 flex flex-col justify-between border border-black/10">
          <div>
            <div className="flex items-center justify-between border-b border-black/10 pb-2.5 mb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-[#7A1F2B]" />
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#374151] font-sans">
                  Scenario Shock Matrix
                </span>
              </div>
              <span className="text-[10px] font-mono text-[#6B7280] font-semibold">
                -25% to +15% Shocks
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-black/10 text-[#6B7280] text-[10px] uppercase">
                    <th className="py-2 text-left font-bold">Shock</th>
                    <th className="py-2 text-right font-bold">Terminal Index</th>
                    <th className="py-2 text-right font-bold">Payoff ({currencySymbol})</th>
                    <th className="py-2 text-right font-bold">Net Return</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {result.scenarios.map((sc, i) => {
                    const isBaseline = sc.underlyingPctChange === 0;
                    return (
                      <tr
                        key={i}
                        className={`transition-colors ${
                          isBaseline ? 'bg-[#7A1F2B]/8 font-bold' : 'hover:bg-black/[0.02]'
                        }`}
                      >
                        <td className="py-2.5 text-left text-[#111827]">
                          {sc.scenarioLabel}
                        </td>
                        <td className="py-2.5 text-right font-medium">
                          {sc.underlyingLevel.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                        </td>
                        <td className="py-2.5 text-right font-semibold">
                          {sc.payoffAmount.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                        </td>
                        <td
                          className={`py-2.5 text-right font-bold ${
                            sc.returnPct > 0
                              ? 'text-[#1B5E20]'
                              : sc.returnPct < 0
                              ? 'text-[#B71C1C]'
                              : 'text-[#111827]'
                          }`}
                        >
                          {sc.returnPct >= 0 ? '+' : ''}
                          {sc.returnPct.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-black/10 flex items-center justify-between text-[11px] font-mono text-[#6B7280]">
            <span>Strike: {(result.inputs as any).strikePct || 100}%</span>
            <span>Barrier: {(result.inputs as any).barrierPct || 'None'}%</span>
            <span>Tenor: {result.inputs.tenorDays}d</span>
          </div>
        </div>
      </div>

      {/* BENTO GRID ROW 3: Risk Terminals (4 Cols) + Forecast Fan Chart (8 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Bento Tile 4: Risk Terminals (4 Cols) */}
        <div className="lg:col-span-4 bento-tile p-5 space-y-4 border border-black/10">
          <div className="flex items-center justify-between border-b border-black/10 pb-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#374151] font-sans">
              Risk Case Outcomes
            </span>
            <span className="text-[10px] font-mono text-[#6B7280]">P5 · P50 · P95</span>
          </div>

          {/* 3 Case Cards */}
          <div className="space-y-2.5">
            {/* Low Case */}
            <div className="p-3 rounded-xl bg-[#FFEBEE] border border-[#FFCDD2]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono uppercase font-bold text-[#B71C1C] flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>{result.cases.low.scenarioLabel}</span>
                </span>
                <span className="text-sm font-bold font-mono text-[#B71C1C]">
                  {result.cases.low.returnPct >= 0 ? '+' : ''}{result.cases.low.returnPct.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-[11px] font-mono text-[#374151]">
                <span>Payoff: {currencySymbol} {result.cases.low.payoffAmount.toLocaleString()}</span>
                <span>Level: {result.cases.low.underlyingLevel.toLocaleString()}</span>
              </div>
            </div>

            {/* Base Case */}
            <div className="p-3 rounded-xl bg-[#F3F0E9] border border-[#E5E0D5]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono uppercase font-bold text-[#7A1F2B] flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5" />
                  <span>{result.cases.base.scenarioLabel}</span>
                </span>
                <span className="text-sm font-bold font-mono text-[#7A1F2B]">
                  {result.cases.base.returnPct >= 0 ? '+' : ''}{result.cases.base.returnPct.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-[11px] font-mono text-[#374151]">
                <span>Payoff: {currencySymbol} {result.cases.base.payoffAmount.toLocaleString()}</span>
                <span>Level: {result.cases.base.underlyingLevel.toLocaleString()}</span>
              </div>
            </div>

            {/* High Case */}
            <div className="p-3 rounded-xl bg-[#E8F5E9] border border-[#A5D6A7]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono uppercase font-bold text-[#1B5E20] flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>{result.cases.high.scenarioLabel}</span>
                </span>
                <span className="text-sm font-bold font-mono text-[#1B5E20]">
                  {result.cases.high.returnPct >= 0 ? '+' : ''}{result.cases.high.returnPct.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-[11px] font-mono text-[#374151]">
                <span>Payoff: {currencySymbol} {result.cases.high.payoffAmount.toLocaleString()}</span>
                <span>Level: {result.cases.high.underlyingLevel.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Probabilities */}
          {result.distribution && (
            <div className="pt-2 border-t border-black/10 space-y-3 font-mono text-xs">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[#4B5563] font-medium">Probability of Capital Loss:</span>
                  <strong className={result.distribution.probLoss > 0.05 ? 'text-[#B71C1C]' : 'text-[#1B5E20]'}>
                    {(result.distribution.probLoss * 100).toFixed(1)}%
                  </strong>
                </div>
                <div className="h-2 w-full bg-[#E5E0D5] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#B71C1C] rounded-full"
                    style={{ width: `${Math.min(100, result.distribution.probLoss * 100)}%` }}
                  />
                </div>
              </div>

              {result.distribution.probKnockIn !== undefined && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[#4B5563] font-medium">Probability of Knock-In:</span>
                    <strong className="text-[#B76E00]">
                      {(result.distribution.probKnockIn * 100).toFixed(1)}%
                    </strong>
                  </div>
                  <div className="h-2 w-full bg-[#E5E0D5] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#B76E00] rounded-full"
                      style={{ width: `${Math.min(100, result.distribution.probKnockIn * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bento Tile 5: Fan Chart (8 Cols) */}
        <div className="lg:col-span-8">
          {result.mode === 'FORECAST' && result.fan ? (
            <FanChart
              fan={result.fan}
              product={result.product}
              inputs={result.inputs}
              spotPrice={result.spotPrice}
            />
          ) : (
            <div className="bento-tile p-8 h-full flex flex-col justify-center items-center text-center border border-black/10">
              <Calendar className="w-10 h-10 text-[#4B5563] mb-3 opacity-40" />
              <h4 className="font-serif text-lg font-bold text-[#111827] mb-1">
                Deterministic Shock Mode Active
              </h4>
              <p className="text-xs text-[#4B5563] max-w-sm">
                Switch to Mode A (GARCH Monte Carlo) on the configuration panel to generate forward stochastic confidence fans with 10,000 paths.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* BENTO GRID ROW 4: Executive Briefing (7 Cols) + RM Assistant Chat (5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Bento Tile 6: Executive Briefing Narrative (7 Cols) */}
        <div className="lg:col-span-7 bento-tile p-6 space-y-4 border border-black/10">
          <div className="border-b border-black/10 pb-2.5 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#374151] font-sans">
              Relationship Manager Executive Briefing
            </span>
            <span className="text-[10px] font-mono text-[#7A1F2B] font-bold">Mandatory Disclosure Copy</span>
          </div>

          <div className="font-serif leading-relaxed text-[15px] text-[#1F2937] space-y-3.5">
            <p>{result.explanation.summary}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-2">
              <div className="p-3.5 rounded-xl bg-[#E8F5E9] border border-[#A5D6A7] text-xs font-sans">
                <strong className="text-[10px] uppercase font-bold text-[#1B5E20] tracking-wider block mb-1">
                  Best-Case Outcome
                </strong>
                <p className="font-serif text-[13px] text-[#1F2937]">{result.explanation.bestCase}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#FFEBEE] border border-[#FFCDD2] text-xs font-sans">
                <strong className="text-[10px] uppercase font-bold text-[#B71C1C] tracking-wider block mb-1">
                  Worst-Case Outcome
                </strong>
                <p className="font-serif text-[13px] text-[#1F2937]">{result.explanation.worstCase}</p>
              </div>
            </div>

            <div>
              <h4 className="font-sans font-bold text-[11px] uppercase tracking-wider text-[#374151] mb-1">
                Trigger Mechanics for Capital Loss
              </h4>
              <p className="text-sm">{result.explanation.lossTrigger}</p>
            </div>

            <div>
              <h4 className="font-sans font-bold text-[11px] uppercase tracking-wider text-[#374151] mb-1">
                Suitability Determination Summary
              </h4>
              <p className="text-sm">{result.explanation.suitabilityRationale}</p>
            </div>
          </div>
        </div>

        {/* Bento Tile 7: RM Assistant Q&A Chat (5 Cols) */}
        <div className="lg:col-span-5 bento-tile flex flex-col justify-between overflow-hidden border border-black/10">
          <div>
            <div className="p-4 bg-[#F8F7F3] border-b border-black/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#7A1F2B]" />
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#111827]">
                  RM Advisory Assistant
                </span>
              </div>
              <span className="text-[9px] font-mono text-[#7A1F2B] font-bold">
                Simulation #{result.id}
              </span>
            </div>

            {/* Message history */}
            <div className="p-4 max-h-64 overflow-y-auto space-y-3 text-xs">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'RM' ? 'items-end' : 'items-start'}`}
                >
                  <div className="text-[9px] font-mono text-[#6B7280] mb-0.5 font-medium">
                    {msg.sender === 'RM' ? 'Relationship Manager' : 'Desk Engine'} · {msg.timestamp}
                  </div>
                  <div
                    className={`max-w-[85%] p-3 rounded-xl leading-relaxed ${
                      msg.sender === 'RM'
                        ? 'bg-[#111827] text-white font-sans shadow-sm'
                        : 'bg-[#F3F0E9] text-[#111827] border border-black/10 font-serif'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            {/* Preset suggestion chips */}
            <div className="p-2.5 border-t border-black/10 bg-[#F8F7F3] flex flex-wrap gap-1.5">
              <button
                onClick={() => handleSendChat('What is the exact breakeven level for this structure?')}
                className="px-2.5 py-1 rounded-lg bg-white border border-black/10 text-[10px] font-medium text-[#111827] hover:border-[#7A1F2B] transition-colors cursor-pointer"
              >
                Breakeven Level?
              </button>
              <button
                onClick={() => handleSendChat('Why was this suitability verdict assigned?')}
                className="px-2.5 py-1 rounded-lg bg-white border border-black/10 text-[10px] font-medium text-[#111827] hover:border-[#7A1F2B] transition-colors cursor-pointer"
              >
                Suitability Rationale?
              </button>
              <button
                onClick={() => handleSendChat('How does this compare to holding the underlying directly?')}
                className="px-2.5 py-1 rounded-lg bg-white border border-black/10 text-[10px] font-medium text-[#111827] hover:border-[#7A1F2B] transition-colors cursor-pointer"
              >
                Direct Equity Compare?
              </button>
            </div>

            {/* Input form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChat();
              }}
              className="p-3 border-t border-black/10 flex gap-2 bg-white"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask follow-up clarifying questions regarding this trade…"
                className="flex-1 bg-[#F4F2EC] border border-black/10 rounded-xl px-3 py-1.5 text-xs font-sans focus:outline-none focus:border-[#7A1F2B]"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-[#111827] text-white rounded-xl font-mono text-xs uppercase hover:bg-[#7A1F2B] transition-colors cursor-pointer flex items-center gap-1 font-bold"
              >
                <Send className="w-3 h-3" />
                <span>Ask</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* BENTO GRID ROW 5: Model Calibration & Governance (Full 12 Cols) */}
      {result.mode === 'FORECAST' && result.modelCard && (
        <div className="bento-tile p-6 bg-[#111827] text-white border-black/40 font-mono text-xs">
          <div className="border-b border-white/15 pb-2.5 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#E5E0D5]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#E5E0D5]">
                Algorithmic Model Governance & Backtest Verification
              </span>
            </div>
            <span className="text-[10px] text-white/60">Basel III / MiFID II Verification</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-white/50 text-[10px] uppercase font-bold">Model Engine</div>
              <div className="font-semibold text-white mt-1">{result.modelCard.model}</div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-white/50 text-[10px] uppercase font-bold">Calibration Window</div>
              <div className="font-semibold text-white mt-1">{result.modelCard.trainingWindow}</div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-white/50 text-[10px] uppercase font-bold">Martingale Drift</div>
              <div className="font-semibold text-white mt-1">{result.modelCard.drift}</div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-white/50 text-[10px] uppercase font-bold">Sample Space</div>
              <div className="font-semibold text-white mt-1">{result.modelCard.pathsCount.toLocaleString()} Discrete Paths</div>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-white/50 block mb-2 font-bold">
              Empirical Backtest Metrics (Actual Coverage vs 90.0% Target):
            </span>
            <table className="w-full text-xs text-right">
              <thead>
                <tr className="text-white/40 border-b border-white/10 text-[10px]">
                  <th className="py-1 text-left">Forecast Horizon</th>
                  <th className="py-1">P5–P95 Interval Coverage</th>
                  <th className="py-1">Confidence Target</th>
                  <th className="py-1">Base MAPE</th>
                  <th className="py-1">Naive MAPE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {result.modelCard.backtest.map((bt, idx) => (
                  <tr key={idx}>
                    <td className="py-2 text-left text-white">{bt.horizonMonths} Months Out</td>
                    <td className="py-2 text-[#4ADE80] font-bold">{bt.coverageP5P95.toFixed(1)}%</td>
                    <td className="py-2 text-white/70">{bt.targetCoverage.toFixed(1)}%</td>
                    <td className="py-2 text-white">{bt.baseMape.toFixed(1)}%</td>
                    <td className="py-2 text-white/50">{bt.naiveMape.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

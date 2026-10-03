/**
 * @license
 * Payoff Desk — Structured Products Suitability Simulator
 * Printable Institutional Suitability Audit Memorandum
 */

import React from 'react';
import { SimulationResult } from '../api/types';

interface PrintReportProps {
  result: SimulationResult;
  onClose: () => void;
}

export const PrintReport: React.FC<PrintReportProps> = ({ result, onClose }) => {
  const currencySymbol =
    result.product === 'DCD'
      ? (result.inputs as any).depositCurrency
      : (result.inputs as any).currency || 'INR';

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm overflow-y-auto p-4 sm:p-8 flex justify-center animate-modal-in"
    >
      {/* Container */}
      <div className="bg-white text-black max-w-4xl w-full p-8 sm:p-12 shadow-2xl rounded-[2px] relative font-serif">
        {/* On-screen control bar (Hidden in print) */}
        <div className="no-print flex items-center justify-between border-b border-[#D9D5CB] pb-4 mb-8">
          <div className="font-mono text-xs text-[#1B1B1B]/70">
            Audit Memorandum Preview · Document Ref #{result.id}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="px-4 py-1.5 bg-[#575757] text-white font-mono text-xs uppercase tracking-wider rounded-lg cursor-pointer hover:bg-[#3D3D3D] transition-colors shadow-xs"
            >
              Print / Save as PDF
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 border border-[#D9D5CB] font-mono text-xs rounded-[2px] cursor-pointer hover:bg-[#F6F4EF]"
            >
              Close
            </button>
          </div>
        </div>

        {/* PRINTABLE MEMO CONTENT */}
        <div className="space-y-6">
          {/* Header */}
          <div className="border-b-2 border-black pb-4 flex justify-between items-start">
            <div>
              <div className="text-[10px] font-sans uppercase tracking-[0.25em] text-neutral-600">
                Private Wealth Management · Structured Investments Desk
              </div>
              <h1 className="text-2xl font-bold mt-1 tracking-tight">
                Suitability & Payoff Simulation Memorandum
              </h1>
              <div className="text-xs font-mono text-neutral-500 mt-1">
                Generated: {new Date(result.asOf).toLocaleString()} IST · System Ver: 4.1
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono">RECORD #{result.id}</div>
              <div className="text-[10px] font-sans uppercase text-neutral-500 mt-1">
                Client File Copy
              </div>
            </div>
          </div>

          {/* Section 1: Parties & Mandate */}
          <div className="grid grid-cols-2 gap-6 text-xs font-sans border-b border-neutral-300 pb-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">
                Investor Profile
              </span>
              <div className="font-semibold text-sm">{result.profile.name}</div>
              <div className="text-neutral-600 mt-0.5">
                Risk Appetite: <strong>{result.profile.riskAppetite}</strong>
              </div>
              <div className="text-neutral-600">
                Mandated Investment Horizon: <strong>{result.profile.investmentHorizonMonths} Months</strong>
              </div>
              <div className="text-neutral-600">
                Contractual Loss Tolerance: <strong>{result.profile.lossTolerancePct.toFixed(1)}% of Notional</strong>
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">
                Transaction Parameters
              </span>
              <div className="font-semibold text-sm">
                {result.product} on {result.underlyingName}
              </div>
              <div className="text-neutral-600 mt-0.5">
                Tenor: <strong>{result.inputs.tenorDays} Calendar Days</strong>
              </div>
              <div className="text-neutral-600">
                Portfolio Allocation: <strong>{result.profile.concentrationPct.toFixed(1)}% (Threshold: 15.0%)</strong>
              </div>
              <div className="text-neutral-600 font-mono">
                Baseline Spot: {result.spotPrice.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Section 2: Suitability Determination */}
          <div className="p-4 border-2 border-black bg-neutral-50">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-neutral-600">
                Official Suitability Determination
              </span>
              <span className="font-mono font-bold text-sm">
                VERDICT: {result.suitability.verdict}
              </span>
            </div>
            <p className="text-xs text-neutral-700 leading-relaxed font-sans">
              {result.explanation.suitabilityRationale}
            </p>

            {result.suitability.flags.length > 0 && (
              <div className="mt-3 pt-3 border-t border-neutral-300 space-y-1.5 font-sans">
                <span className="text-[10px] font-bold uppercase text-neutral-600 block">
                  Mandatory Compliance Exception Flags:
                </span>
                {result.suitability.flags.map((flag, i) => (
                  <div key={i} className="text-xs text-neutral-800">
                    • <strong>{flag.rule} [{flag.severity}]:</strong> {flag.reason}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Scenario Table */}
          <div>
            <h3 className="text-xs font-sans uppercase font-bold tracking-wider mb-2 text-neutral-700">
              Deterministic Market Shock Distribution
            </h3>
            <table className="w-full text-xs font-mono border-collapse border border-neutral-300">
              <thead>
                <tr className="bg-neutral-100 border-b border-neutral-300 text-neutral-600 text-[10px]">
                  <th className="p-2 text-left">Market Shock</th>
                  <th className="p-2 text-right">Terminal Level</th>
                  <th className="p-2 text-right">Payoff ({currencySymbol})</th>
                  <th className="p-2 text-right">Net Return %</th>
                  <th className="p-2 text-center">Loss Trigger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {result.scenarios.map((sc, i) => (
                  <tr key={i}>
                    <td className="p-2 text-left font-sans">{sc.scenarioLabel}</td>
                    <td className="p-2 text-right">{sc.underlyingLevel.toLocaleString()}</td>
                    <td className="p-2 text-right font-semibold">{sc.payoffAmount.toLocaleString()}</td>
                    <td className="p-2 text-right">{sc.returnPct >= 0 ? '+' : ''}{sc.returnPct.toFixed(2)}%</td>
                    <td className="p-2 text-center text-[10px]">
                      {sc.knockedIn ? 'YES (Knock-in/Loss)' : 'NO (Protected)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section 4: Narrative Disclosure */}
          <div className="space-y-3 text-xs leading-relaxed text-neutral-800 border-t border-neutral-300 pt-4">
            <div>
              <strong className="font-sans text-[11px] uppercase tracking-wide block mb-0.5">
                Product Mechanics & Payoff Formula:
              </strong>
              <p>{result.explanation.summary}</p>
            </div>
            <div>
              <strong className="font-sans text-[11px] uppercase tracking-wide block mb-0.5">
                Downside Risk Analysis:
              </strong>
              <p>{result.explanation.worstCase}</p>
            </div>
          </div>

          {/* Section 5: Model Calibration (if Mode A) */}
          {result.modelCard && (
            <div className="p-3 bg-neutral-100 border border-neutral-300 text-[10px] font-mono text-neutral-700">
              <span className="font-bold uppercase block mb-1">
                Quantitative Engine Audit Metadata
              </span>
              <div>Model: {result.modelCard.model}</div>
              <div>Training Window: {result.modelCard.trainingWindow}</div>
              <div>Drift Convention: {result.modelCard.drift}</div>
              <div>Monte Carlo Discrete Paths: {result.modelCard.pathsCount.toLocaleString()}</div>
            </div>
          )}

          {/* Section 6: Sign-off block */}
          <div className="pt-8 border-t-2 border-black grid grid-cols-2 gap-8 text-xs font-sans">
            <div>
              <div className="h-10 border-b border-black mb-1" />
              <div className="font-semibold">Relationship Manager Signature</div>
              <div className="text-[10px] text-neutral-500">Rajesh Sharma (PB-719) · Mumbai Desk</div>
            </div>
            <div>
              <div className="h-10 border-b border-black mb-1" />
              <div className="font-semibold">Compliance / Supervisory Officer</div>
              <div className="text-[10px] text-neutral-500">Suitability Sign-off Date: _______________</div>
            </div>
          </div>

          {/* Regulatory Disclaimer */}
          <div className="text-[9px] font-sans text-neutral-500 leading-tight pt-2 border-t border-neutral-200">
            Disclaimer: This document is an internal private banking suitability analysis produced solely for advisory evaluation. It does not constitute a firm commitment to trade or a contract confirmation. Structured products involve derivative risks including contingent loss of principal.
          </div>
        </div>
      </div>
    </div>
  );
};

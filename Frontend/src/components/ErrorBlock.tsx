/**
 * @license
 * Payoff Desk — Structured Products Suitability Simulator
 * Enterprise Claymorphic Forecast Service Error Block
 */

import React from 'react';
import { AlertTriangle, RefreshCw, ArrowRight } from 'lucide-react';

interface ErrorBlockProps {
  message?: string;
  onSwitchToModeB: () => void;
  onRetry: () => void;
}

export const ErrorBlock: React.FC<ErrorBlockProps> = ({
  message = 'Forecast service did not return a valid result. No substitute forecast has been generated.',
  onSwitchToModeB,
  onRetry,
}) => {
  return (
    <div className="clay-tile p-6 border-l-4 border-l-[#8A2B20] my-6 space-y-4 text-[#2C2C2C]">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-2xl bg-[#F8DFDB] text-[#782218] flex items-center justify-center shrink-0 shadow-xs border border-[#E29B93]">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="space-y-3 flex-1">
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider font-bold text-[#782218] mb-1">
              Engine Execution Exception
            </h4>
            <p className="text-sm font-serif text-[#2C2C2C] leading-relaxed font-medium">
              {message}
            </p>
            <p className="text-xs font-mono text-[#575757] mt-2">
              In accordance with banking risk policy, simulated forecasts must never be fabricated or approximated without converging Student-t stochastic variance parameters.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={onSwitchToModeB}
              className="clay-btn-primary px-4 py-2 text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer font-bold"
            >
              <span>Switch to Mode B (Manual Shock)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRetry}
              className="clay-btn-secondary px-4 py-2 text-xs font-mono flex items-center gap-1.5 cursor-pointer font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#575757]" />
              <span>Retry Engine</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

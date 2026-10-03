/**
 * @license
 * Payoff Desk — Structured Products Suitability Simulator
 * High-Visibility Enterprise Side Navigation Rail
 */

import React from 'react';
import { ProductType, SavedSimulationRecord } from '../api/types';
import {
  Layers,
  FileSpreadsheet,
  ShieldCheck,
  Clock,
  ArrowRight,
  History,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
} from 'lucide-react';

interface ProductRailProps {
  activeProduct: ProductType;
  onSelectProduct: (p: ProductType) => void;
  recentSimulations: SavedSimulationRecord[];
  onOpenSimulation: (sim: SavedSimulationRecord) => void;
  onOpenSavedModal: () => void;
  savedCount: number;
}

export const ProductRail: React.FC<ProductRailProps> = ({
  activeProduct,
  onSelectProduct,
  recentSimulations,
  onOpenSimulation,
  onOpenSavedModal,
  savedCount,
}) => {
  const products: {
    id: ProductType;
    name: string;
    subname: string;
    summary: string;
    keyInputs: string;
    riskRating: 'Higher' | 'Lower';
    icon: any;
  }[] = [
    {
      id: 'ELN',
      name: 'Equity Linked Note',
      subname: 'Reverse Convertible',
      summary: 'High coupon yield; downside equity risk if barrier breached.',
      keyInputs: 'Strike 100% · Barrier 85% · 9.5% p.a.',
      riskRating: 'Higher',
      icon: Layers,
    },
    {
      id: 'DCD',
      name: 'Dual Currency Deposit',
      subname: 'Yield Enhancement',
      summary: 'Enhanced deposit; conversion into alternate currency past strike.',
      keyInputs: 'USD/INR · Strike 84.00 · 8.25% p.a.',
      riskRating: 'Higher',
      icon: FileSpreadsheet,
    },
    {
      id: 'CPN',
      name: 'Capital Protected Note',
      subname: 'Principal Preservation',
      summary: '100% principal floor plus leveraged participation in index upside.',
      keyInputs: '100% Floor · 75% Participation',
      riskRating: 'Lower',
      icon: ShieldCheck,
    },
  ];

  return (
    <aside className="w-[310px] p-4 flex flex-col justify-between shrink-0 h-full overflow-hidden select-none no-print gap-4 border-r border-black/10 bg-white/60">
      {/* Upper Section: Products */}
      <div className="overflow-y-auto space-y-4 pr-1">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#374151]">
            Product Engine
          </span>
          <span className="text-[10px] font-mono text-[#6B7280] font-semibold">3 Instruments</span>
        </div>

        <div className="space-y-2.5">
          {products.map((p) => {
            const isSelected = activeProduct === p.id;
            const Icon = p.icon;
            return (
              <div
                key={p.id}
                onClick={() => onSelectProduct(p.id)}
                className={`p-3.5 rounded-xl cursor-pointer transition-all duration-200 border ${
                  isSelected
                    ? 'bg-white border-[#7A1F2B] shadow-md ring-1 ring-[#7A1F2B]/20'
                    : 'bg-white/70 border-black/10 hover:bg-white hover:border-black/20 shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-[#7A1F2B] text-white shadow-xs'
                          : 'bg-[#F3F0E9] text-[#374151]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#111827] leading-tight">
                        {p.name}
                      </div>
                      <div className="text-[10px] font-serif text-[#4B5563] italic">
                        {p.subname}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      p.riskRating === 'Higher'
                        ? 'border-[#B71C1C]/30 text-[#B71C1C] bg-[#FFEBEE]'
                        : 'border-[#1B5E20]/30 text-[#1B5E20] bg-[#E8F5E9]'
                    }`}
                  >
                    {p.riskRating} Risk
                  </span>
                </div>

                <p className="text-[11px] leading-snug text-[#374151] my-1.5">
                  {p.summary}
                </p>

                <div className="flex items-center justify-between text-[10px] font-mono pt-1.5 border-t border-black/5">
                  <span className="text-[#6B7280] font-medium truncate">{p.keyInputs}</span>
                  <span
                    className={`flex items-center gap-1 font-bold ${
                      isSelected ? 'text-[#7A1F2B]' : 'text-[#4B5563] hover:text-[#111827]'
                    }`}
                  >
                    <span>{isSelected ? 'Active' : 'Select'}</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent Runs Stack */}
        <div className="pt-2">
          <div className="flex items-center justify-between px-1 mb-2">
            <div className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-[#374151]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#374151]">
                Recent Runs
              </span>
            </div>
            <button
              onClick={onOpenSavedModal}
              className="text-[11px] font-mono text-[#7A1F2B] font-bold hover:underline cursor-pointer"
            >
              All ({savedCount})
            </button>
          </div>

          <div className="space-y-2">
            {recentSimulations.slice(0, 3).map((sim) => {
              const isSuitable = sim.verdict === 'SUITABLE';
              const isCaution = sim.verdict === 'CAUTION';

              return (
                <div
                  key={sim.id}
                  onClick={() => onOpenSimulation(sim)}
                  className="p-3 bg-white rounded-xl border border-black/10 hover:border-black/25 shadow-xs cursor-pointer transition-all hover:-translate-y-0.5"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#6B7280] mb-1">
                    <span>{sim.savedAt.split('T')[0]}</span>
                    <span>{sim.mode === 'FORECAST' ? 'GARCH' : 'SHOCK'}</span>
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-[#111827]">
                      {sim.product} · {sim.underlying}
                    </span>
                    <span
                      className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        isSuitable
                          ? 'bg-[#E8F5E9] text-[#1B5E20] border border-[#A5D6A7]'
                          : isCaution
                          ? 'bg-[#FFF8E1] text-[#B76E00] border border-[#FFE082]'
                          : 'bg-[#FFEBEE] text-[#B71C1C] border border-[#FFCDD2]'
                      }`}
                    >
                      {isSuitable ? (
                        <CheckCircle2 className="w-2.5 h-2.5" />
                      ) : isCaution ? (
                        <AlertTriangle className="w-2.5 h-2.5" />
                      ) : (
                        <XCircle className="w-2.5 h-2.5" />
                      )}
                      <span>{sim.verdict.replace('_', ' ')}</span>
                    </span>
                  </div>
                  <div className="text-[11px] text-[#4B5563] truncate">
                    Client: {sim.clientName}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Audit Pill */}
      <div className="p-3 rounded-xl bg-white border border-black/10 shadow-xs flex items-center justify-between text-xs text-[#374151] shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#7A1F2B]" />
          <span className="font-medium">Audit Trail Active</span>
        </div>
        <button
          onClick={onOpenSavedModal}
          className="text-[#7A1F2B] font-mono text-[11px] font-bold hover:underline cursor-pointer"
        >
          Ledger →
        </button>
      </div>
    </aside>
  );
};

/**
 * @license
 * Payoff Desk — Structured Products Suitability Simulator
 * Enterprise Claymorphic Saved Simulations Audit Archive
 */

import React, { useState } from 'react';
import { SavedSimulationRecord, Verdict } from '../api/types';
import { History, Printer, ArrowRight, X } from 'lucide-react';

interface SavedSimulationsModalProps {
  records: SavedSimulationRecord[];
  onSelectRecord: (record: SavedSimulationRecord) => void;
  onClose: () => void;
  onPrintRecord: (record: SavedSimulationRecord) => void;
}

export const SavedSimulationsModal: React.FC<SavedSimulationsModalProps> = ({
  records,
  onSelectRecord,
  onClose,
  onPrintRecord,
}) => {
  const [filterVerdict, setFilterVerdict] = useState<Verdict | 'ALL'>('ALL');
  const [selectedRecord, setSelectedRecord] = useState<SavedSimulationRecord | null>(
    records[0] || null
  );

  const filteredRecords = records.filter(
    (r) => filterVerdict === 'ALL' || r.verdict === filterVerdict
  );

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 select-none"
    >
      <div className="clay-tile text-[var(--ink-primary)] max-w-5xl w-full h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[var(--border-strong)] animate-modal-in">
        {/* Header */}
        <div className="h-14 border-b border-[var(--border-color)] bg-[var(--well-bg)] px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent-primary)] flex items-center justify-center text-[var(--accent-text)] shadow-inner">
              <History className="w-4 h-4 text-[var(--accent-gold)]" />
            </div>
            <div>
              <span className="font-serif text-base font-bold text-[var(--ink-primary)]">
                Simulation Audit Archive
              </span>
              <span className="text-[10px] font-mono text-[var(--ink-muted)] ml-2 font-semibold">
                ({records.length} Recorded Mandates)
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl clay-btn-secondary flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="px-6 py-2.5 border-b border-[var(--border-color)] bg-[var(--well-deep)] flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-[var(--ink-muted)] text-[11px] font-semibold">Verdict Filter:</span>
            {(['ALL', 'SUITABLE', 'CAUTION', 'NOT_SUITABLE'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setFilterVerdict(v)}
                className={`px-3 py-1 rounded-lg cursor-pointer transition-all ${
                  filterVerdict === v
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] shadow-xs font-bold'
                    : 'clay-btn-secondary text-[11px]'
                }`}
              >
                {v.replace('_', ' ')}
              </button>
            ))}
          </div>
          <span className="text-[var(--ink-muted)] text-[11px] hidden sm:inline">
            Private Banking Audit Trail · Institutional Records
          </span>
        </div>

        {/* Body Layout (Two column: List Left, Detail Right) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left list */}
          <div className="w-80 border-r border-[var(--border-color)] bg-[var(--well-bg)] overflow-y-auto p-3 space-y-2">
            {filteredRecords.length === 0 ? (
              <div className="p-6 text-center text-xs font-mono text-[var(--ink-muted)]">
                No simulations found for filter.
              </div>
            ) : (
              filteredRecords.map((r) => {
                const isSelected = selectedRecord?.id === r.id;
                const verdictBadge =
                  r.verdict === 'SUITABLE'
                    ? 'clay-badge-suitable'
                    : r.verdict === 'CAUTION'
                    ? 'clay-badge-caution'
                    : 'clay-badge-unsafe';

                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRecord(r)}
                    className={`p-3 rounded-2xl cursor-pointer transition-all ${
                      isSelected
                        ? 'clay-tile-light border-l-4 border-l-[var(--accent-primary)] shadow-sm'
                        : 'hover:bg-[var(--well-deep)]'
                    }`}
                  >
                    <div className="flex justify-between text-[10px] font-mono text-[var(--ink-muted)] mb-1">
                      <span>{r.id}</span>
                      <span>{r.savedAt.split('T')[0]}</span>
                    </div>
                    <div className="font-semibold text-xs text-[var(--ink-primary)] mb-0.5">
                      {r.product} · {r.underlying}
                    </div>
                    <div className="text-[11px] text-[var(--ink-muted)] truncate mb-1.5">
                      Client: {r.clientName}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-[var(--ink-secondary)]">{r.tenorDays}d · {r.notionalFormatted}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${verdictBadge}`}>
                        {r.verdict.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Detail Pane */}
          <div className="flex-1 bg-[var(--card-bg)] overflow-y-auto p-6 space-y-4">
            {selectedRecord ? (
              <div>
                <div className="flex items-start justify-between border-b border-[var(--border-color)] pb-4 mb-4">
                  <div>
                    <div className="text-[10px] font-mono text-[var(--ink-muted)] uppercase tracking-wider">
                      Audit Record Details #{selectedRecord.id}
                    </div>
                    <h2 className="font-serif text-xl font-bold text-[var(--ink-primary)]">
                      {selectedRecord.product} ({selectedRecord.underlying})
                    </h2>
                    <div className="text-xs text-[var(--ink-muted)] mt-1">
                      Client: <strong>{selectedRecord.clientName}</strong> · Mandate:{' '}
                      {selectedRecord.result.profile.riskAppetite}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onPrintRecord(selectedRecord)}
                      className="clay-btn-secondary px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Memo</span>
                    </button>
                    <button
                      onClick={() => {
                        onSelectRecord(selectedRecord);
                        onClose();
                      }}
                      className="clay-btn-primary px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <span>Load into Desk</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Verdict Badge */}
                <div className="clay-tile-light p-4 mb-4 flex items-center justify-between text-xs border border-[var(--border-subtle)]">
                  <div>
                    <span className="text-[10px] font-mono text-[var(--ink-muted)] uppercase block">
                      Suitability Determination
                    </span>
                    <strong
                      className={`text-sm font-mono ${
                        selectedRecord.verdict === 'SUITABLE'
                          ? 'text-[var(--status-suitable-text)]'
                          : selectedRecord.verdict === 'CAUTION'
                          ? 'text-[var(--status-caution-text)]'
                          : 'text-[var(--status-breach-text)]'
                      }`}
                    >
                      {selectedRecord.verdict.replace('_', ' ')}
                    </strong>
                  </div>
                  <div className="text-right text-[11px] font-mono text-[var(--ink-muted)]">
                    <div>Horizon: {selectedRecord.result.profile.investmentHorizonMonths} Mo</div>
                    <div>Loss Tolerance: {selectedRecord.result.profile.lossTolerancePct}%</div>
                  </div>
                </div>

                {/* Scenario Snapshot Table */}
                <div className="clay-tile-light p-4 rounded-2xl mb-4 border border-[var(--border-subtle)]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)] mb-2 font-sans">
                    Stored Deterministic Scenario Distribution
                  </div>
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[var(--border-color)] text-[10px] text-[var(--ink-muted)] text-right">
                        <th className="py-1 text-left">Shock Case</th>
                        <th className="py-1">Underlying Level</th>
                        <th className="py-1">Payoff</th>
                        <th className="py-1">Net Return</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {selectedRecord.result.scenarios.map((sc, i) => (
                        <tr key={i} className="text-right">
                          <td className="py-2 text-left text-[var(--ink-primary)]">{sc.scenarioLabel}</td>
                          <td className="py-2 text-[var(--ink-secondary)]">₹{sc.underlyingLevel.toLocaleString()}</td>
                          <td className="py-2 font-semibold text-[var(--ink-primary)]">₹{Math.round(sc.payoffAmount).toLocaleString()}</td>
                          <td
                            className={`py-2 font-bold ${
                              sc.returnPct < 0 ? 'text-[var(--status-breach-text)]' : 'text-[var(--status-suitable-text)]'
                            }`}
                          >
                            {sc.returnPct > 0 ? `+${sc.returnPct.toFixed(1)}%` : `${sc.returnPct.toFixed(1)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Rationale notes */}
                <div className="clay-tile-light p-4 rounded-2xl border border-[var(--border-subtle)]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)] mb-1 font-sans">
                    Suitability Rationale
                  </div>
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    {selectedRecord.result.explanation.suitabilityRationale}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-xs font-mono text-[var(--ink-muted)]">
                Select an audit record on the left to view details.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

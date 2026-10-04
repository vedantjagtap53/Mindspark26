/**
 * @license
 * Payoff Desk — Structured Products Suitability Simulator
 * Enterprise Top Navigation Header with Palette Theme Switcher
 */

import React, { useState } from 'react';
import { ProductType } from '../api/types';

import {
  Activity,
  History,
  Printer,
  Play,
  User,
  Compass,
  Sliders,
  Sparkles,
  BarChart3,
  FileCheck,
  LayoutGrid,
  Palette,
} from 'lucide-react';

export type JourneyStage = 'MANDATE' | 'CONFIG' | 'SIMULATION' | 'OUTCOMES' | 'DELIVERY' | 'COCKPIT';
export type AppTheme = 'executive' | 'midnight' | 'sand' | 'emerald';

interface TopNavProps {
  activeStage: JourneyStage;
  onSelectStage: (stage: JourneyStage) => void;
  onOpenSavedModal: () => void;
  onPrintMemo: () => void;
  onRunSimulation: () => void;
  loading: boolean;
  elapsedSeconds: number;
  savedCount: number;
  maxAllowedStageIndex: number;
  theme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeStage,
  onSelectStage,
  onOpenSavedModal,
  onPrintMemo,
  onRunSimulation,
  loading,
  elapsedSeconds,
  savedCount,
  maxAllowedStageIndex,
  theme,
  onSelectTheme,
}) => {
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const stages: { id: JourneyStage; label: string; number: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'MANDATE', label: '1. Mandate', number: '1', icon: Compass },
    { id: 'CONFIG', label: '2. Structure', number: '2', icon: Sliders },
    { id: 'SIMULATION', label: '3. Simulate', number: '3', icon: Sparkles },
    { id: 'OUTCOMES', label: '4. Payoffs', number: '4', icon: BarChart3 },
    { id: 'DELIVERY', label: '5. Verdict', number: '5', icon: FileCheck },
  ];

  const themes: { id: AppTheme; label: string; dotColor: string }[] = [
    { id: 'executive', label: 'Executive Slate', dotColor: '#1E293B' },
    { id: 'midnight', label: 'Midnight Dark', dotColor: '#0B0F17' },
    { id: 'sand', label: 'Pale Sand', dotColor: '#D8C9AE' },
    { id: 'emerald', label: 'Forest Emerald', dotColor: '#154D39' },
  ];

  return (
    <header className="min-h-14 sm:min-h-16 py-2 px-3 sm:px-6 bg-[var(--card-bg)]/95 backdrop-blur-md border-b border-[var(--border-color)] flex flex-wrap items-center justify-between gap-2.5 select-none shrink-0 no-print z-40 shadow-[0_4px_16px_rgba(0,0,0,0.06)] sticky top-0 transition-colors duration-200">
      {/* Left: Brand Identity */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[var(--accent-gradient)] flex items-center justify-center text-[var(--accent-text)] shadow-md border border-white/20">
          <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--accent-gold)]" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-serif text-base sm:text-lg font-bold tracking-tight text-[var(--ink-primary)]">
              Payoff Desk
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full clay-badge-suitable font-bold hidden xs:inline-block">
              LIVE
            </span>
          </div>
          <div className="text-[10px] text-[var(--ink-muted)] font-medium hidden md:block">
            Suitability Journey
          </div>
        </div>
      </div>

      {/* Center: Interactive Advisory Journey Stepper */}
      <nav className="flex items-center p-1 bg-[var(--well-bg)] rounded-xl border border-[var(--border-color)] shadow-inner gap-0.5 sm:gap-1 overflow-x-auto max-w-full">
        {stages.map((st, i) => {
          const isActive = activeStage === st.id;
          const isDisabled = i > maxAllowedStageIndex;
          const Icon = st.icon;

          return (
            <button
              key={st.id}
              disabled={isDisabled}
              onClick={() => onSelectStage(st.id)}
              className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 whitespace-nowrap ${
                isActive
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] shadow-xs font-bold cursor-default'
                  : isDisabled
                  ? 'text-[var(--ink-muted)] opacity-50 cursor-not-allowed'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/40 cursor-pointer'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[var(--accent-gold)]' : 'text-[var(--ink-muted)]'}`} />
              <span>{st.label}</span>
            </button>
          );
        })}

        {/* View All Cockpit Mode Toggle */}
        <div className="h-4 w-px bg-[var(--border-color)] mx-0.5 sm:mx-1 shrink-0" />
        <button
          onClick={() => onSelectStage('COCKPIT')}
          className={`px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeStage === 'COCKPIT'
              ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] shadow-xs font-bold'
              : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
          }`}
          title="Cockpit: Overview of all modules"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Cockpit</span>
        </button>
      </nav>

      {/* Right: Client Mandate, Theme Switcher, Archive, Memo & Action */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Palette Theme Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowThemeMenu((prev) => !prev)}
            className="clay-btn-secondary px-2.5 py-1.5 text-xs font-mono flex items-center gap-1.5 cursor-pointer font-medium"
            title="Change Color Palette"
          >
            <Palette className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
            <span className="hidden sm:inline capitalize text-[11px] font-semibold">{theme}</span>
          </button>

          {showThemeMenu && (
            <div
              className="absolute right-0 mt-1.5 w-44 rounded-xl clay-tile p-1.5 shadow-xl border border-[var(--border-strong)] z-50 animate-modal-in"
              onMouseLeave={() => setShowThemeMenu(false)}
            >
              <div className="text-[10px] font-mono text-[var(--ink-muted)] px-2 py-1 font-semibold uppercase tracking-wider">
                Select Theme Palette
              </div>
              {themes.map((th) => (
                <button
                  key={th.id}
                  onClick={() => {
                    onSelectTheme(th.id);
                    setShowThemeMenu(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between cursor-pointer transition-colors ${
                    theme === th.id
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] font-bold'
                      : 'text-[var(--ink-primary)] hover:bg-[var(--well-bg)]'
                  }`}
                >
                  <span>{th.label}</span>
                  <span
                    className="w-3 h-3 rounded-full border border-white/40 shadow-xs"
                    style={{ backgroundColor: th.dotColor }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>


        {/* Audit Archive Trigger */}
        <button
          onClick={onOpenSavedModal}
          className="clay-btn-secondary px-2.5 sm:px-3 py-1.5 text-xs font-mono flex items-center gap-1.5 cursor-pointer font-medium"
          title="Open Saved Simulations Audit Archive"
        >
          <History className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
          <span className="hidden xl:inline">Archive</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[var(--accent-primary)] text-[var(--accent-text)]">
            {savedCount}
          </span>
        </button>

        {/* Print Memo Trigger */}
        <button
          onClick={onPrintMemo}
          className="clay-btn-secondary px-2.5 py-1.5 text-xs font-mono flex items-center gap-1.5 cursor-pointer font-medium"
          title="Print Institutional Suitability Memo"
        >
          <Printer className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
          <span className="hidden xl:inline">Memo</span>
        </button>

        {/* Run Simulation CTA */}
        <button
          onClick={onRunSimulation}
          disabled={loading}
          className="clay-btn-primary px-3 sm:px-3.5 py-1.5 text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
        >
          <Play className="w-3 h-3 fill-current text-[var(--accent-gold)]" />
          <span>{loading ? `${elapsedSeconds.toFixed(1)}s` : 'Run'}</span>
        </button>
      </div>
    </header>
  );
};

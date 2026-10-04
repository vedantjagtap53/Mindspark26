/**
 * @license
 * Payoff Desk — Structured Products Suitability Simulator
 * Main Application Shell with Interactive Suitability Journey
 * Palette: Pale Sand (#D8C9AE) & Charcoal Gray (#575757)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ProductType,
  SimMode,
  SimulationResult,
  SavedSimulationRecord,
  ProductInputs,
  ClientProfile,
} from './api/types';
import {
  runSimulation,
  SEEDED_SAVED_SIMULATIONS,
} from './api/mock';
import { TopNav, JourneyStage, AppTheme } from './components/TopNav';
import { BentoWorkspace } from './components/BentoWorkspace';
import { ErrorBlock } from './components/ErrorBlock';
import { SavedSimulationsModal } from './components/SavedSimulationsModal';
import { PrintReport } from './components/PrintReport';
import { CustomCursor } from './components/CustomCursor';

export default function App() {
  const [theme, setTheme] = useState<AppTheme>('executive');
  const [activeStage, setActiveStage] = useState<JourneyStage>('MANDATE');
  const [activeProduct, setActiveProduct] = useState<ProductType>('ELN');
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [savedSimulations, setSavedSimulations] = useState<SavedSimulationRecord[]>(
    SEEDED_SAVED_SIMULATIONS
  );
  const [isSavedModalOpen, setIsSavedModalOpen] = useState<boolean>(false);
  const [printResult, setPrintResult] = useState<SimulationResult | null>(null);

  // Active Client Profile
  const [profile, setProfile] = useState<ClientProfile>({
    name: '',
    age: '',
    riskAppetite: 'Moderate',
    investmentHorizonMonths: 12,
    lossTolerancePct: 15,
    concentrationPct: 20,
    portfolioValue: 10000000,
  });

  const [maxAllowedStageIndex, setMaxAllowedStageIndex] = useState<number>(0);

  const handleSelectStage = (stage: JourneyStage) => {
    const idx = ['MANDATE', 'CONFIG', 'SIMULATION', 'OUTCOMES', 'DELIVERY', 'COCKPIT'].indexOf(stage);
    if (idx > maxAllowedStageIndex && stage !== 'COCKPIT') {
      setMaxAllowedStageIndex(idx);
    }
    setActiveStage(stage);
  };

  // Execution & Latency state
  const [loading, setLoading] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [errorState, setErrorState] = useState<{ hasError: boolean; message: string } | null>(null);

  const timerRef = useRef<number | null>(null);



  // Initial simulation on mount
  useEffect(() => {
    const initSim = async () => {
      setLoading(true);
      startTimer();
      try {
        const defaultInputs: ProductInputs = {
          underlying: 'NIFTY 50',
          currency: 'INR',
          notional: 2500000,
          tenorDays: 180,
          strikePct: 100,
          barrierPct: 88,
          couponPctPa: 9.5,
          barrierType: 'European',
        };
        const initialRes = await runSimulation('ELN', 'FORECAST', defaultInputs, profile);
        setResult(initialRes);
      } catch (err: any) {
        setErrorState({ hasError: true, message: err?.message || 'Execution error.' });
      } finally {
        stopTimer();
        setLoading(false);
      }
    };
    initSim();
  }, []);

  const startTimer = () => {
    setElapsedSeconds(0);
    const start = performance.now();
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds(Math.round((performance.now() - start) / 100) / 10);
    }, 100);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleSimulate = async (
    inputs: ProductInputs,
    mandateProfile: ClientProfile,
    mode: SimMode,
    options: {
      trainingWindowYears: number;
      shockPct: number;
      forceFailure: boolean;
      isStaleData: boolean;
    }
  ) => {
    setLoading(true);
    setErrorState(null);
    startTimer();

    try {
      const res = await runSimulation(activeProduct, mode, inputs, mandateProfile, options);
      setResult(res);
    } catch (err: any) {
      setErrorState({
        hasError: true,
        message: err?.message || 'Forecast service did not return a valid result. No substitute forecast has been generated.',
      });
    } finally {
      stopTimer();
      setLoading(false);
    }
  };

  const handleSaveSimulation = (simResult: SimulationResult) => {
    const formattedNotional =
      simResult.product === 'DCD'
        ? `${(simResult.inputs as any).depositCurrency} ${(simResult.inputs as any).depositAmount.toLocaleString()}`
        : `${(simResult.inputs as any).currency || 'INR'} ${(simResult.inputs as any).notional.toLocaleString()}`;

    const newRecord: SavedSimulationRecord = {
      id: simResult.id,
      savedAt: new Date().toISOString(),
      clientName: simResult.profile.name,
      product: simResult.product,
      underlying: simResult.underlyingName,
      notionalFormatted: formattedNotional,
      tenorDays: simResult.inputs.tenorDays,
      verdict: simResult.suitability.verdict,
      mode: simResult.mode,
      result: simResult,
    };

    setSavedSimulations((prev) => [newRecord, ...prev.filter((p) => p.id !== simResult.id)]);
  };

  const handleSelectRecordFromAudit = (record: SavedSimulationRecord) => {
    setActiveProduct(record.product);
    setResult(record.result);
    setProfile(record.result.profile);
    setErrorState(null);
  };

  return (
    <div
      data-theme={theme}
      className="min-h-screen bg-[var(--canvas-bg)] text-[var(--canvas-text)] font-sans flex flex-col antialiased selection:bg-[var(--border-strong)] transition-colors duration-250"
    >
      {/* High-Precision Claymorphic Custom Cursor */}
      <CustomCursor />

      {/* Unified Enterprise Top Navigation Header */}
      <TopNav
        activeStage={activeStage}
        onSelectStage={handleSelectStage}
        onOpenSavedModal={() => setIsSavedModalOpen(true)}
        onPrintMemo={() => {
          if (result) setPrintResult(result);
        }}
        onRunSimulation={() => {
          if (result) {
            handleSimulate(result.inputs, profile, result.mode, {
              trainingWindowYears: 10,
              shockPct: -10,
              forceFailure: false,
              isStaleData: false,
            });
          }
        }}
        loading={loading}
        elapsedSeconds={elapsedSeconds}
        savedCount={savedSimulations.length}
        maxAllowedStageIndex={maxAllowedStageIndex}
        theme={theme}
        onSelectTheme={setTheme}
      />

      {/* Main Interactive Journey Workspace */}
      <main className="flex-1 overflow-y-auto">
        {errorState?.hasError ? (
          <div className="p-6 max-w-4xl mx-auto">
            <ErrorBlock
              message={errorState.message}
              onSwitchToModeB={() => {
                setErrorState(null);
                if (result) {
                  handleSimulate(result.inputs, profile, 'SHOCK', {
                    trainingWindowYears: 10,
                    shockPct: -10,
                    forceFailure: false,
                    isStaleData: false,
                  });
                }
              }}
              onRetry={() => {
                setErrorState(null);
              }}
            />
          </div>
        ) : (
          <BentoWorkspace
            activeStage={activeStage}
            onSelectStage={handleSelectStage}
            product={activeProduct}
            onSelectProduct={(p) => {
              setActiveProduct(p);
              setErrorState(null);
            }}
            result={result}
            loading={loading}
            elapsedSeconds={elapsedSeconds}
            profile={profile}
            onUpdateProfile={setProfile}
            onRunSimulation={handleSimulate}
            onSaveSimulation={handleSaveSimulation}
            onPrintMemo={(r) => setPrintResult(r)}
            recentSimulations={savedSimulations}
            onOpenSimulation={(sim) => {
              setActiveProduct(sim.product);
              setResult(sim.result);
              setProfile(sim.result.profile);
              setErrorState(null);
            }}
            onOpenSavedModal={() => setIsSavedModalOpen(true)}
          />
        )}
      </main>

      {/* Saved Simulations & Audit Record Modal */}
      {isSavedModalOpen && (
        <SavedSimulationsModal
          records={savedSimulations}
          onSelectRecord={handleSelectRecordFromAudit}
          onClose={() => setIsSavedModalOpen(false)}
          onPrintRecord={(rec) => {
            setIsSavedModalOpen(false);
            setPrintResult(rec.result);
          }}
        />
      )}

      {/* Printable Institutional Suitability Memorandum */}
      {printResult && (
        <PrintReport
          result={printResult}
          onClose={() => setPrintResult(null)}
        />
      )}
    </div>
  );
}

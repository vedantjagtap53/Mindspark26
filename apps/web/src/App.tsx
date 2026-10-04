// Payoff Desk: the RM journey (PRD §7) in five stages. Every number comes from the backend API.
import { useState } from 'react';
import { CustomCursor } from './components/CustomCursor';
import { ErrorBlock } from './components/ErrorBlock';
import { PrintReport } from './components/PrintReport';
import { SessionRunsModal } from './components/SessionRunsModal';
import { StageHeader } from './components/StageHeader';
import { TopNav, type Stage } from './components/TopNav';
import { LandingPage } from './pages/LandingPage';
import { useSimulation } from './hooks/useSimulation';
import { MandatePage } from './pages/MandatePage';
import { OutcomesPage } from './pages/OutcomesPage';
import { SimulatePage } from './pages/SimulatePage';
import { StructurePage } from './pages/StructurePage';
import { VerdictPage } from './pages/VerdictPage';
import { termIssues } from './schemas/terms';
import {
  DEFAULT_FORMS,
  DEFAULT_PROFILE,
  DEFAULT_RUN,
  runSettingsFor,
  type Forms,
  type ProductType,
  type ProfileForm,
  type RunSettings,
} from './state/forms';
import type { SessionRun } from './types/session';

export function App() {
  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState<Stage>('MANDATE');
  const [product, setProductState] = useState<ProductType>('ELN');
  const [forms, setForms] = useState<Forms>(DEFAULT_FORMS);
  const [profile, setProfile] = useState<ProfileForm>(DEFAULT_PROFILE);
  const [run, setRun] = useState<RunSettings>(DEFAULT_RUN);
  const [runsOpen, setRunsOpen] = useState(false);
  const [printRun, setPrintRun] = useState<SessionRun | null>(null);
  const sim = useSimulation();

  const issueCount = Object.keys(termIssues(product, forms)).length;
  const current = sim.current;

  const setProduct = (p: ProductType) => {
    setRun((r) => runSettingsFor(product, p, r));
    setProductState(p);
    sim.clearError();
  };

  const execute = () => void sim.run(product, forms, run, profile);

  const loadRun = (r: SessionRun) => {
    setProductState(r.product);
    setProfile(r.profile);
    setRun(r.run);
    sim.setCurrent(r);
    sim.clearError();
    setRunsOpen(false);
    setStage('OUTCOMES');
  };

  if (!started) {
    return <LandingPage onStart={() => setStarted(true)} />;
  }

  return (
    <div
      className="min-h-screen bg-[var(--canvas-bg)] text-[var(--canvas-text)] font-sans flex flex-col antialiased transition-colors duration-200"
    >
      <CustomCursor />
      <TopNav
        stage={stage}
        onStage={setStage}
        runCount={sim.runs.length}
        onOpenRuns={() => setRunsOpen(true)}
        onPrint={current ? () => setPrintRun(current) : undefined}
        loading={sim.loading}
        elapsedSeconds={sim.elapsedSeconds}
      />

      <main className="no-print flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
        <StageHeader
          stage={stage}
          onStage={setStage}
          onPrint={current ? () => setPrintRun(current) : undefined}
        />

        {sim.error && (
          <ErrorBlock
            error={sim.error}
            onDismiss={sim.clearError}
            onSwitchToModeB={
              run.mode === 'A'
                ? () => {
                    setRun({ ...run, mode: 'B' });
                    sim.clearError();
                    setStage('SIMULATE');
                  }
                : undefined
            }
            onUseManualLevel={() => {
              setRun({ ...run, levelSource: 'manual' });
              sim.clearError();
              setStage('SIMULATE');
            }}
          />
        )}

        {stage === 'MANDATE' && (
          <MandatePage product={product} profile={profile} onProfile={setProfile} run={current} />
        )}
        {stage === 'STRUCTURE' && (
          <StructurePage
            product={product}
            onProduct={setProduct}
            forms={forms}
            onForms={setForms}
          />
        )}
        {stage === 'SIMULATE' && (
          <SimulatePage
            product={product}
            symbol={product === 'DCD' ? '' : forms[product].symbol}
            run={run}
            onRun={setRun}
            termIssueCount={issueCount}
            loading={sim.loading}
            elapsedSeconds={sim.elapsedSeconds}
            onExecute={execute}
            latest={current}
          />
        )}
        {stage === 'OUTCOMES' && <OutcomesPage run={current} />}
        {stage === 'VERDICT' && (
          <VerdictPage
            product={product}
            profile={profile}
            run={current}
            onUpdateRun={sim.updateRun}
          />
        )}
      </main>

      {runsOpen && (
        <SessionRunsModal
          runs={sim.runs}
          onLoad={loadRun}
          onPrint={(r) => {
            setRunsOpen(false);
            setPrintRun(r);
          }}
          onClose={() => setRunsOpen(false)}
        />
      )}
      {printRun && <PrintReport run={printRun} onClose={() => setPrintRun(null)} />}
    </div>
  );
}

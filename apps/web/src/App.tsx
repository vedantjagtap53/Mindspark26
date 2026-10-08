// Payoff Desk: the RM journey (PRD §7) in five stages. Every number comes from the backend API.
import { useState, type ReactNode } from 'react';
import { ErrorBlock } from './components/ErrorBlock';
import { PrintReport } from './components/PrintReport';
import { SessionRunsModal } from './components/SessionRunsModal';
import { CompareRuns } from './components/simulation/CompareRuns';
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

interface AppProps {
  /** Skip the home page: the user has already signed in (or chosen to continue without an account). */
  startOnDesk?: boolean;
  /** Account controls (user menu, extra buttons) shown at the right of the top bar. */
  userSlot?: ReactNode;
  /** The user is signed in, so the Runs window also lists the runs saved to their account. */
  savedRuns?: boolean;
}

export function App({ userSlot, startOnDesk = false, savedRuns = false }: AppProps = {}) {
  const [started, setStarted] = useState(startOnDesk);
  const [stage, setStage] = useState<Stage>('MANDATE');
  const [product, setProductState] = useState<ProductType>('ELN');
  const [forms, setForms] = useState<Forms>(DEFAULT_FORMS);
  const [profile, setProfile] = useState<ProfileForm>(DEFAULT_PROFILE);
  const [run, setRun] = useState<RunSettings>(DEFAULT_RUN);
  const [runsOpen, setRunsOpen] = useState(false);
  const [printRun, setPrintRun] = useState<SessionRun | null>(null);
  const [compareRuns, setCompareRuns] = useState<SessionRun[] | null>(null);
  const sim = useSimulation();

  const issueCount = Object.keys(termIssues(product, forms)).length;
  const current = sim.current;

  const setProduct = (p: ProductType) => {
    setRun((r) => runSettingsFor(product, p, r));
    setProductState(p);
    sim.clearError();
    sim.clearContext();
  };

  const changeForms = (f: Forms) => {
    setForms(f);
    sim.clearContext();
  };

  const changeRun = (r: RunSettings) => {
    setRun(r);
    sim.clearContext();
  };

  const execute = () => void sim.run(product, forms, run, profile);

  const loadRun = (r: SessionRun) => {
    setProductState(r.product);
    setProfile(r.profile);
    setRun(r.run);
    sim.setCurrent(r);
    sim.clearError();
    sim.clearContext();
    setRunsOpen(false);
    setStage('OUTCOMES');
  };

  if (!started) {
    return <LandingPage onStart={() => setStarted(true)} userSlot={userSlot} />;
  }

  return (
    <div className="min-h-screen bg-[var(--canvas-bg)] text-[var(--canvas-text)] font-sans flex flex-col antialiased transition-colors duration-200">
      <TopNav
        stage={stage}
        onStage={setStage}
        runCount={sim.runs.length}
        onOpenRuns={() => setRunsOpen(true)}
        onPrint={current ? () => setPrintRun(current) : undefined}
        loading={sim.loading}
        elapsedSeconds={sim.elapsedSeconds}
        trailing={userSlot}
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
            onForms={changeForms}
          />
        )}
        {stage === 'SIMULATE' && (
          <SimulatePage
            product={product}
            symbol={product === 'DCD' ? '' : forms[product].symbol}
            run={run}
            onRun={changeRun}
            termIssueCount={issueCount}
            strikeRate={forms.DCD.strikeRate}
            loading={sim.loading}
            elapsedSeconds={sim.elapsedSeconds}
            onExecute={execute}
            latest={current}
            context={product === 'DCD' ? sim.context : null}
            onUseModeB={() => changeRun({ ...run, mode: 'B' })}
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
          savedRuns={savedRuns}
          onLoad={loadRun}
          onPrint={(r) => {
            setRunsOpen(false);
            setPrintRun(r);
          }}
          onCompare={(rs) => {
            setRunsOpen(false);
            setCompareRuns(rs);
          }}
          onClose={() => setRunsOpen(false)}
        />
      )}
      {compareRuns && <CompareRuns runs={compareRuns} onClose={() => setCompareRuns(null)} />}
      {printRun && <PrintReport run={printRun} onClose={() => setPrintRun(null)} />}
    </div>
  );
}

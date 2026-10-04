import { FanChart } from '../components/charts/FanChart';
import { PayoffChart } from '../components/charts/PayoffChart';
import { ModelCard } from '../components/risk/ModelCard';
import { RiskPanel } from '../components/risk/RiskPanel';
import { ScenarioTable } from '../components/risk/ScenarioTable';
import { RunSummary } from '../components/simulation/RunSummary';
import { Placeholder, SectionHeader, Tile } from '../components/ui';
import type { SessionRun } from '../types/session';
import { formatLevel } from '../utils/format';
import { currencyOf, fanLines, payoffMarkers, underlyingLabel } from '../utils/run';

export function OutcomesPage({ run }: { run: SessionRun | null }) {
  if (!run) {
    return (
      <Tile className="animate-journey-step">
        <Placeholder
          title="No result yet"
          reason="Run a simulation in stage 3. Payoffs, scenarios and the forecast fan come from the backend."
        />
      </Tile>
    );
  }

  const r = run.response;
  const ccy = currencyOf(run);
  const label = underlyingLabel(run);

  return (
    <div className="space-y-5 animate-journey-step">
      <Tile>
        <SectionHeader kicker={`${run.id} · ${run.product}`} title="Result" />
        <RunSummary run={run} />
      </Tile>

      {/* Same kind of table in both modes: payoff if the underlying ends at each shock from the start. */}
      <Tile>
        <SectionHeader
          kicker="Payoff at maturity"
          title={`Return across ${label} moves`}
          aside={
            <span className="text-xs text-[var(--ink-muted)] font-mono">
              {r.mode === 'B'
                ? `Start ${formatLevel(r.level.value)}`
                : `From spot ${formatLevel(r.spot.value)}`}
            </span>
          }
        />
        <PayoffChart
          curve={r.curve}
          currency={ccy}
          currentShockPct={r.mode === 'B' ? r.shock.pct : null}
          markers={payoffMarkers(run)}
          breakevens={r.breakevens}
          axisLabel={label}
        />
      </Tile>
      <Tile>
        <SectionHeader kicker="PRD scenario comparison" title="Payoff at −25%, −10%, 0% and +15%" />
        <ScenarioTable scenarios={r.scenarios} currency={ccy} levelLabel={`${label} level`} />
      </Tile>

      {r.mode === 'A' && (
        <>
          <Tile>
            <SectionHeader
              kicker="Mode A forecast"
              title={`${label}: 5th–95th percentile range`}
              aside={
                <span className="text-xs text-[var(--ink-muted)] font-mono">
                  Spot {formatLevel(r.spot.value)}
                </span>
              }
            />
            <FanChart
              fan={r.fan}
              asOf={r.spot.asOf}
              lines={fanLines(run)}
              cases={[
                { label: 'Low', terminal: r.cases.low.terminal },
                { label: 'Base', terminal: r.cases.base.terminal },
                { label: 'High', terminal: r.cases.high.terminal },
              ]}
            />
          </Tile>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Tile>
              <SectionHeader kicker="Risk panel" title="Low, base and high cases" />
              <RiskPanel response={r} currency={ccy} />
            </Tile>
            <Tile>
              <SectionHeader kicker="Model card" title="How the forecast was made" />
              <ModelCard model={r.model} backtest={r.backtest} />
            </Tile>
          </div>
        </>
      )}
    </div>
  );
}

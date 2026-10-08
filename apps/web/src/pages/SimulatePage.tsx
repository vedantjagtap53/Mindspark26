import type { SimulateModeAContextResponse } from '@mindspark/shared';
import { ForecastContextPanel } from '../components/simulation/ForecastContextPanel';
import { ModePicker } from '../components/simulation/ModePicker';
import { RunSummary } from '../components/simulation/RunSummary';
import { SectionHeader, Tile } from '../components/ui';
import type { ProductType, RunSettings } from '../state/forms';
import type { SessionRun } from '../types/session';

interface Props {
  product: ProductType;
  symbol: string;
  run: RunSettings;
  onRun: (r: RunSettings) => void;
  termIssueCount: number;
  strikeRate: number;
  loading: boolean;
  elapsedSeconds: number;
  onExecute: () => void;
  latest: SessionRun | null;
  /** DCD Mode A: the Nifty 50 forecast, shown as context only. */
  context: SimulateModeAContextResponse | null;
  onUseModeB: () => void;
}

export function SimulatePage({ latest, context, onUseModeB, ...picker }: Props) {
  return (
    <div className="space-y-5">
      <ModePicker {...picker} />
      {context && <ForecastContextPanel context={context} onUseModeB={onUseModeB} />}
      {latest && (
        <Tile>
          <SectionHeader kicker={`Latest run · ${latest.id}`} title="Result" />
          <RunSummary run={latest} />
        </Tile>
      )}
    </div>
  );
}

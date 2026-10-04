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
  profileIssue: string | null;
  loading: boolean;
  elapsedSeconds: number;
  onExecute: () => void;
  latest: SessionRun | null;
}

export function SimulatePage({ latest, ...picker }: Props) {
  return (
    <div className="space-y-5 animate-journey-step">
      <ModePicker {...picker} />
      {latest && (
        <Tile>
          <SectionHeader kicker={`Latest run · ${latest.id}`} title="Result" />
          <RunSummary run={latest} />
        </Tile>
      )}
    </div>
  );
}

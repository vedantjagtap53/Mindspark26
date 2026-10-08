import { ChatPanel, ExplanationPanel } from '../components/chat/ChatPanel';
import { SuitabilityPanel } from '../components/suitability/SuitabilityPanel';
import type { ProductType, ProfileForm } from '../state/forms';
import type { SessionRun } from '../types/session';

interface Props {
  product: ProductType;
  profile: ProfileForm;
  run: SessionRun | null;
  onUpdateRun: (
    id: string,
    patch: Partial<SessionRun> | ((run: SessionRun) => Partial<SessionRun>),
  ) => void;
}

export function VerdictPage({ product, profile, run, onUpdateRun }: Props) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SuitabilityPanel product={product} profile={profile} run={run} />
        <ExplanationPanel run={run} onUpdate={onUpdateRun} />
      </div>
      <ChatPanel run={run} onUpdate={onUpdateRun} />
    </div>
  );
}

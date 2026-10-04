import { ClientProfileForm } from '../components/client/ClientProfileForm';
import { SuitabilityPanel } from '../components/suitability/SuitabilityPanel';
import type { ProductType, ProfileForm } from '../state/forms';
import type { SessionRun } from '../types/session';

interface Props {
  product: ProductType;
  profile: ProfileForm;
  onProfile: (p: ProfileForm) => void;
  run: SessionRun | null;
}

export function MandatePage({ product, profile, onProfile, run }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-journey-step">
      <div className="lg:col-span-7">
        <ClientProfileForm profile={profile} onChange={onProfile} />
      </div>
      <div className="lg:col-span-5">
        <SuitabilityPanel product={product} profile={profile} run={run} />
      </div>
    </div>
  );
}

// Load and save client profiles through /api/client-profiles (no delete, no ownership: not CRM).
// The database may not be configured; the backend's error is shown as-is and nothing is faked.
import { useEffect, useState } from 'react';
import { Download, Save } from 'lucide-react';
import type { SavedProfile } from '@mindspark/shared';
import { api } from '../../api/client';
import { toApiError } from '../../hooks/useSimulation';
import { profileFromSaved, savedProfileBody, type ProfileForm } from '../../state/forms';

interface Props {
  profile: ProfileForm;
  onChange: (p: ProfileForm) => void;
}

const buttonClass =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-[var(--border-color)] bg-[var(--well-bg)] hover:bg-[var(--accent-primary)] hover:text-[var(--accent-text)] disabled:opacity-40 disabled:cursor-not-allowed';

export function SavedProfiles({ profile, onChange }: Props) {
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const showError = (prefix: string, err: unknown) => {
    const e = toApiError(err);
    setStatus({ tone: 'error', text: `${prefix} (${e.code}): ${e.message}` });
  };

  const refresh = () =>
    api.listProfiles().then(
      (r) => setProfiles(r.profiles),
      (err: unknown) => showError('Saved profiles unavailable', err),
    );

  useEffect(() => {
    let active = true;
    api.listProfiles().then(
      (r) => active && setProfiles(r.profiles),
      (err: unknown) => {
        if (!active) return;
        const e = toApiError(err);
        setStatus({ tone: 'error', text: `Saved profiles unavailable (${e.code}): ${e.message}` });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const load = () => {
    const p = profiles.find((x) => x.id === selected);
    if (!p) return;
    onChange(profileFromSaved(p));
    setStatus({ tone: 'ok', text: `Loaded ${p.clientRef}.` });
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = savedProfileBody(profile);
      const saved = profile.profileId
        ? await api.updateProfile(profile.profileId, body)
        : await api.createProfile(body);
      onChange(profileFromSaved(saved));
      setStatus({ tone: 'ok', text: `Saved ${saved.clientRef}.` });
      await refresh();
      setSelected(saved.id);
    } catch (err) {
      showError('Not saved', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 p-3 rounded-xl border border-[var(--border-color)] bg-[var(--well-bg)]/60">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[12rem]">
          <label
            htmlFor="saved-profile"
            className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1 uppercase"
          >
            Saved profile
          </label>
          <select
            id="saved-profile"
            className="clay-inset w-full px-3 py-2 text-xs font-semibold text-[var(--ink-primary)]"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">{profiles.length ? 'Choose a profile…' : 'No saved profiles'}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.clientRef}
                {p.label ? ` · ${p.label}` : ''}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className={buttonClass} onClick={load} disabled={!selected}>
          <Download className="w-3.5 h-3.5" aria-hidden /> Load saved profile
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => void save()}
          disabled={busy || profile.clientRef.trim() === ''}
        >
          <Save className="w-3.5 h-3.5" aria-hidden />
          {profile.profileId ? 'Update saved profile' : 'Save profile'}
        </button>
      </div>
      <p className="text-[10px] text-[var(--ink-muted)]">
        {profile.profileId
          ? 'Runs are linked to this saved profile; the audit record keeps a frozen copy of the fields used.'
          : 'Enter a client reference to save. An unsaved profile is still recorded with each verdict.'}
      </p>
      {status && (
        <p
          role="status"
          className={`text-[11px] ${status.tone === 'error' ? 'text-[var(--status-breach-text)]' : 'text-[var(--status-suitable-text)]'}`}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}

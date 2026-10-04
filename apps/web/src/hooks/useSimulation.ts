// Runs /api/simulate, then /api/suitability for the same run, and keeps this session's results.
// A failed run leaves no result behind: the error is shown as-is and nothing is substituted.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '../api/client';
import { assessSuitability, simulate } from '../services/simulation';
import {
  termsFor,
  type Forms,
  type ProductType,
  type ProfileForm,
  type RunSettings,
} from '../state/forms';
import type { SessionRun } from '../types/session';

export const toApiError = (err: unknown): ApiRequestError =>
  err instanceof ApiRequestError
    ? err
    : new ApiRequestError(0, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : String(err));

export type RunPatch = Partial<SessionRun> | ((run: SessionRun) => Partial<SessionRun>);

function patchRun(runs: SessionRun[], id: string, patch: RunPatch): SessionRun[] {
  return runs.map((r) =>
    r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r,
  );
}

export function useSimulation() {
  const [runs, setRuns] = useState<SessionRun[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const timer = useRef<number | null>(null);
  const seq = useRef(0);

  const stopTimer = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stopTimer, []);

  /** Merge a change into one run (the list is the single source of truth). */
  const updateRun = useCallback(
    (id: string, patch: RunPatch) => setRuns((prev) => patchRun(prev, id, patch)),
    [],
  );

  const run = useCallback(
    async (product: ProductType, forms: Forms, settings: RunSettings, profile: ProfileForm) => {
      setLoading(true);
      setError(null);
      setElapsedSeconds(0);
      const start = performance.now();
      stopTimer();
      timer.current = window.setInterval(
        () => setElapsedSeconds(Math.round((performance.now() - start) / 100) / 10),
        100,
      );
      try {
        const response = await simulate(product, forms, settings);
        seq.current += 1;
        const record: SessionRun = {
          id: `run-${seq.current}`,
          at: new Date().toISOString(),
          product,
          profile: { ...profile },
          run: { ...settings },
          terms: termsFor(product, forms),
          response,
          chat: [],
        };
        setRuns((prev) => [record, ...prev]);
        setCurrentId(record.id);
        // The verdict is a separate call; a failure there keeps the result and is shown on its own.
        try {
          const suitability = await assessSuitability(response.simulationId, profile);
          updateRun(record.id, { suitability });
        } catch (err) {
          updateRun(record.id, { suitabilityError: toApiError(err) });
        }
        return true;
      } catch (err) {
        setError(toApiError(err));
        return false;
      } finally {
        stopTimer();
        setLoading(false);
      }
    },
    [updateRun],
  );

  const clearError = useCallback(() => setError(null), []);
  const current = runs.find((r) => r.id === currentId) ?? null;

  return {
    runs,
    current,
    setCurrent: (r: SessionRun) => setCurrentId(r.id),
    updateRun,
    loading,
    elapsedSeconds,
    error,
    clearError,
    run,
  };
}

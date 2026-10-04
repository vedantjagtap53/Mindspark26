// Live price next to "Live level": streamed from /api/live, shown with its trade time and age.
// The run itself uses the level the backend resolves at that moment, which may differ slightly.
import { useEffect, useState } from 'react';
import { useLiveTicker } from '../../hooks/useLiveTicker';
import { formatLevel } from '../../utils/format';

function ageText(asOf: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(asOf)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

export function LiveTicker({ symbol }: { symbol: string }) {
  const ticker = useLiveTicker(symbol.trim() || null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  if (!ticker) return null;
  const dot =
    ticker.status === 'live'
      ? 'bg-[var(--status-suitable-text)] animate-live-beacon'
      : ticker.status === 'error'
        ? 'bg-[var(--status-breach-text)]'
        : 'bg-[var(--ink-muted)]';

  return (
    <div
      role="status"
      aria-live="polite"
      className="p-2.5 rounded-lg bg-[var(--well-bg)] border border-[var(--border-subtle)] space-y-0.5"
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
        <span className="flex items-center gap-1.5 font-semibold text-[var(--ink-primary)]">
          <span className={`inline-block w-2 h-2 rounded-full ${dot}`} aria-hidden />
          {symbol}
        </span>
        {ticker.price !== undefined && (
          <span className="text-base font-bold text-[var(--ink-primary)]">
            {formatLevel(ticker.price)}
          </span>
        )}
      </div>
      <p className="text-[10px] text-[var(--ink-muted)]">
        {ticker.status === 'connecting' && 'Connecting to live prices…'}
        {ticker.status === 'waiting' &&
          `Subscribed via ${ticker.provider ?? 'live feed'}; waiting for a trade (none while the market is closed).`}
        {ticker.status === 'live' &&
          ticker.asOf &&
          `Last trade ${new Date(ticker.asOf).toLocaleTimeString()} (${ageText(ticker.asOf, now)}) · ${ticker.provider ?? ''}`}
        {ticker.status === 'error' && ticker.error?.message}
      </p>
    </div>
  );
}

import React from 'react';
import { cn } from '@/lib/utils';
import type { MatchSignals } from '@/types/api';

interface SignalBreakdownProps {
  signals: MatchSignals;
  composite_score?: number;
  ai_confidence?: number;
}

interface SignalBarProps {
  label: string;
  value: number;
  large?: boolean;
  color?: 'auto' | 'purple';
}

function getBarColor(value: number): string {
  if (value >= 80) return 'var(--color-success)';
  if (value >= 50) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function getTextColor(value: number): string {
  if (value >= 80) return 'text-[var(--color-success)]';
  if (value >= 50) return 'text-[var(--color-warning)]';
  return 'text-[var(--color-danger)]';
}

const SignalBar: React.FC<SignalBarProps> = ({ label, value, large = false, color = 'auto' }) => {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const barColor = color === 'purple' ? 'var(--color-accent-secondary)' : getBarColor(pct);
  const textCls = color === 'purple' ? 'text-[var(--color-accent-secondary)]' : getTextColor(pct);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'font-mono uppercase tracking-wider text-[var(--color-text-secondary)]',
            large ? 'text-xs' : 'text-[10px]'
          )}
        >
          {label}
        </span>
        <span className={cn('font-mono font-bold tabular-nums', large ? 'text-sm' : 'text-xs', textCls)}>
          {Math.round(pct)}%
        </span>
      </div>
      <div
        className={cn(
          'w-full rounded-full overflow-hidden bg-[var(--color-border)]',
          large ? 'h-2.5' : 'h-1.5'
        )}
      >
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: barColor,
            boxShadow: `0 0 6px ${barColor}60`,
          }}
        />
      </div>
    </div>
  );
};

export const SignalBreakdown: React.FC<SignalBreakdownProps> = ({
  signals,
  composite_score,
  ai_confidence,
}) => {
  const signalRows: Array<{ key: keyof MatchSignals; label: string }> = [
    { key: 'email_score', label: 'Email' },
    { key: 'phone_score', label: 'Phone' },
    { key: 'name_score', label: 'Name' },
    { key: 'dob_score', label: 'Date of Birth' },
    { key: 'address_score', label: 'Address' },
  ];

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-3">
        Match Signals
      </p>

      <div className="space-y-2.5">
        {signalRows.map(({ key, label }) => (
          <SignalBar key={key} label={label} value={signals[key] ?? 0} />
        ))}
      </div>

      {(composite_score !== undefined || ai_confidence !== undefined) && (
        <>
          <div className="my-3 border-t border-[var(--color-border)]" />
          <div className="space-y-3">
            {composite_score !== undefined && (
              <SignalBar label="Composite Score" value={composite_score} large />
            )}
            {ai_confidence !== undefined && (
              <SignalBar label="AI Confidence" value={ai_confidence} large color="purple" />
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SignalBreakdown;

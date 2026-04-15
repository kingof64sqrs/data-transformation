import React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import type { AISuggestion } from '@/types/api';

interface AIInsightPanelProps {
  suggestion: AISuggestion | null;
  loading: boolean;
  onFetch?: () => void;
  className?: string;
}

function SuggestionBadge({ suggestion }: { suggestion: AISuggestion['suggestion'] }) {
  const config = {
    approve: {
      label: 'Approve',
      cls: 'bg-[var(--color-success)]/15 text-[var(--color-success)] border border-[var(--color-success)]/40',
      dot: 'bg-[var(--color-success)]',
    },
    reject: {
      label: 'Reject',
      cls: 'bg-[var(--color-danger)]/15 text-[var(--color-danger)] border border-[var(--color-danger)]/40',
      dot: 'bg-[var(--color-danger)]',
    },
    uncertain: {
      label: 'Uncertain',
      cls: 'bg-[var(--color-warning)]/15 text-[var(--color-warning)] border border-[var(--color-warning)]/40',
      dot: 'bg-[var(--color-warning)]',
    },
  };

  const c = config[suggestion];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider',
        c.cls
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', c.dot)} />
      {c.label}
    </span>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const color =
    pct >= 0.8
      ? 'var(--color-success)'
      : pct >= 0.5
      ? 'var(--color-warning)'
      : 'var(--color-danger)';

  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] shrink-0">
        Confidence
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct * 100}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}80` }}
        />
      </div>
      <span
        className="font-mono font-bold text-sm tabular-nums shrink-0"
        style={{ color }}
      >
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-5 w-32 rounded" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-5/6 rounded" />
      <Skeleton className="h-4 w-4/6 rounded" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}

export const AIInsightPanel: React.FC<AIInsightPanelProps> = ({
  suggestion,
  loading,
  onFetch,
  className,
}) => {
  return (
    <div
      className={cn(
        'panel-border rounded-xl overflow-hidden',
        'bg-gradient-to-br from-[var(--color-accent-secondary)]/8 via-[var(--color-surface-1)] to-[var(--color-surface-1)]',
        'border border-[var(--color-accent-secondary)]/25',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-accent-secondary)]/20">
        <div className="flex items-center gap-2.5">
          <span className="text-[var(--color-accent-secondary)] text-base leading-none">✦</span>
          <span className="font-mono text-xs uppercase tracking-widest font-bold text-[var(--color-accent-secondary)]">
            AI Intelligence
          </span>
        </div>
        {onFetch && !loading && (
          <button
            onClick={onFetch}
            className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-accent-secondary)] hover:text-[var(--color-text-primary)] transition-colors px-2 py-1 rounded border border-[var(--color-accent-secondary)]/30 hover:border-[var(--color-accent-secondary)] hover:bg-[var(--color-accent-secondary)]/10"
          >
            Refresh
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {loading && <LoadingSkeleton />}

        {!loading && !suggestion && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-accent-secondary)]/10 border border-[var(--color-accent-secondary)]/20 flex items-center justify-center text-xl text-[var(--color-accent-secondary)]">
              ✦
            </div>
            <div>
              <p className="text-[var(--color-text-primary)] font-medium text-sm mb-1">
                AI Analysis Available
              </p>
              <p className="text-[var(--color-text-muted)] text-xs font-mono">
                Run AI analysis to get a decision recommendation.
              </p>
            </div>
            {onFetch && (
              <button
                onClick={onFetch}
                className="px-5 py-2.5 rounded-lg text-sm font-mono font-bold uppercase tracking-wider transition-all
                  bg-[var(--color-accent-secondary)]/15 text-[var(--color-accent-secondary)]
                  border border-[var(--color-accent-secondary)]/40
                  hover:bg-[var(--color-accent-secondary)]/25 hover:border-[var(--color-accent-secondary)]/70
                  hover:shadow-[0_0_16px_var(--color-accent-secondary)/30]"
              >
                Get AI Analysis
              </button>
            )}
          </div>
        )}

        {!loading && suggestion && (
          <div className="space-y-4">
            {/* Decision badge + confidence */}
            <div className="flex flex-wrap items-center gap-3">
              <SuggestionBadge suggestion={suggestion.suggestion} />
            </div>

            <ConfidenceMeter value={suggestion.confidence} />

            {/* Reasoning */}
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                Reasoning
              </p>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                {suggestion.reasoning}
              </p>
            </div>

            {/* Alternative explanation */}
            {suggestion.alternative_explanation && (
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                  Alternative
                </p>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed italic">
                  {suggestion.alternative_explanation}
                </p>
              </div>
            )}

            {/* Key signals */}
            {suggestion.key_signals && suggestion.key_signals.length > 0 && (
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                  Key Signals
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestion.key_signals.map((signal, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-full text-[10px] font-mono font-medium
                        bg-[var(--color-accent-secondary)]/10 text-[var(--color-accent-secondary)]
                        border border-[var(--color-accent-secondary)]/25"
                    >
                      {signal}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Risk flags */}
            {suggestion.risk_flags && suggestion.risk_flags.length > 0 && (
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-danger)]">
                  Risk Flags
                </p>
                <div className="flex flex-col gap-1.5">
                  {suggestion.risk_flags.map((flag, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs text-[var(--color-danger)] font-mono"
                    >
                      <span className="mt-0.5 shrink-0 text-[var(--color-danger)]">⚠</span>
                      {flag}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIInsightPanel;

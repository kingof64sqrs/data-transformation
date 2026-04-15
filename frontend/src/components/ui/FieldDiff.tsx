import React from 'react';
import { cn } from '@/lib/utils';

export interface FieldDiffRow {
  label: string;
  value1: string | null;
  value2: string | null;
  similarity?: number;
}

interface FieldDiffProps {
  fields: FieldDiffRow[];
  label1?: string;
  label2?: string;
  className?: string;
}

type MatchKind = 'exact' | 'fuzzy' | 'different' | 'both-null';

function classify(row: FieldDiffRow): MatchKind {
  const { value1, value2, similarity } = row;
  if (value1 === null && value2 === null) return 'both-null';
  if (value1 === null || value2 === null) return 'different';
  if (value1.trim().toLowerCase() === value2.trim().toLowerCase()) return 'exact';
  if (similarity !== undefined && similarity > 0.6) return 'fuzzy';
  return 'different';
}

function MatchIndicator({ kind, similarity }: { kind: MatchKind; similarity?: number }) {
  if (kind === 'exact') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30"
        title="Exact match"
      >
        <span className="w-1 h-1 rounded-full bg-[var(--color-success)]" />
        Exact
      </span>
    );
  }
  if (kind === 'fuzzy') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/30"
        title={similarity !== undefined ? `Similarity: ${Math.round(similarity * 100)}%` : 'Fuzzy match'}
      >
        <span className="w-1 h-1 rounded-full bg-[var(--color-warning)]" />
        {similarity !== undefined ? `${Math.round(similarity * 100)}%` : 'Fuzzy'}
      </span>
    );
  }
  if (kind === 'both-null') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-[var(--color-border)] text-[var(--color-text-muted)]">
        Both null
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
      title="No match"
    >
      <span className="w-1 h-1 rounded-full bg-[var(--color-danger)]" />
      Diff
    </span>
  );
}

function CellValue({ value, kind, side }: { value: string | null; kind: MatchKind; side: 'left' | 'right' }) {
  if (value === null || value === '') {
    return <span className="italic text-[var(--color-text-muted)] text-xs font-mono">null</span>;
  }

  if (kind === 'exact') {
    return (
      <span className="text-[var(--color-text-primary)] text-sm font-code bg-[var(--color-success)]/8 rounded px-1">
        {value}
      </span>
    );
  }

  if (kind === 'fuzzy') {
    return (
      <span className="text-[var(--color-text-primary)] text-sm font-code underline decoration-[var(--color-warning)] decoration-wavy underline-offset-2">
        {value}
      </span>
    );
  }

  if (kind === 'different') {
    return (
      <span className="text-[var(--color-danger)] text-sm font-code font-bold">
        {value}
      </span>
    );
  }

  return <span className="text-[var(--color-text-muted)] text-sm font-code italic">{value}</span>;
}

export const FieldDiff: React.FC<FieldDiffProps> = ({
  fields,
  label1 = 'Record A',
  label2 = 'Record B',
  className,
}) => {
  if (!fields || fields.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--color-text-muted)] font-mono text-sm italic">
        No fields to compare.
      </div>
    );
  }

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] w-28">
              Field
            </th>
            <th className="py-2 px-4 font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
              {label1}
            </th>
            <th className="py-2 px-4 font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
              {label2}
            </th>
            <th className="py-2 pl-4 font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] text-right w-24">
              Match
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((row, idx) => {
            const kind = classify(row);
            const rowBg =
              kind === 'exact'
                ? 'bg-[var(--color-success)]/4 hover:bg-[var(--color-success)]/8'
                : kind === 'both-null'
                ? 'hover:bg-[var(--color-surface-2)]/30'
                : 'hover:bg-[var(--color-surface-2)]/30';

            return (
              <tr
                key={idx}
                className={cn(
                  'border-b border-[var(--color-border)]/50 transition-colors',
                  rowBg
                )}
              >
                <td className="py-2.5 pr-4 font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] whitespace-nowrap">
                  {row.label}
                </td>
                <td className="py-2.5 px-4 max-w-[200px] truncate">
                  <CellValue value={row.value1} kind={kind} side="left" />
                </td>
                <td className="py-2.5 px-4 max-w-[200px] truncate">
                  <CellValue value={row.value2} kind={kind} side="right" />
                </td>
                <td className="py-2.5 pl-4 text-right">
                  <MatchIndicator kind={kind} similarity={row.similarity} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default FieldDiff;

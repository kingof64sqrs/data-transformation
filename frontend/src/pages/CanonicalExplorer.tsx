import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  RefreshCw,
  Search,
  CheckCircle,
  XCircle,
  ChevronRight,
  AlertTriangle,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import api from '@/api/client';
import { Skeleton } from '@/components/ui/Skeleton';
import { SidePanel } from '@/components/ui/SidePanel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfidenceBar } from '@/components/ui/ConfidenceBar';
import { LayerKPIStats } from '@/components/ui/LayerKPIStats';
import type { CanonicalRecord, CanonicalStats } from '@/types/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QualityIssues {
  missing_email: number;
  invalid_email: number;
  missing_phone: number;
  invalid_phone: number;
  low_completeness: number;
  total_issues: number;
}

interface CanonicalRecordsResponse {
  records: CanonicalRecord[];
  total: number;
  offset: number;
  limit: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function completenessColor(score: number): string {
  if (score > 80) return 'var(--color-success)';
  if (score >= 50) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function completenessLabel(score: number): 'SUCCESS' | 'WARN' | 'DANGER' {
  if (score > 80) return 'SUCCESS';
  if (score >= 50) return 'WARN';
  return 'DANGER';
}

function toPercent(score: number | null | undefined): number {
  const value = Number(score ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value <= 1 ? value * 100 : value);
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

const StatTile: React.FC<{ label: string; value: string; sub?: string; accent?: string }> = ({
  label,
  value,
  sub,
  accent = 'var(--color-text-primary)',
}) => (
  <div className="flex flex-col px-5 py-4 border-r border-[var(--color-border)] last:border-r-0 flex-1 min-w-[140px]">
    <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1">{label}</span>
    <span className="font-mono text-2xl font-bold" style={{ color: accent }}>
      {value}
    </span>
    {sub && <span className="font-mono text-[10px] text-[var(--color-text-muted)] mt-0.5">{sub}</span>}
  </div>
);

// ─── Inline Completeness Bar ──────────────────────────────────────────────────

const InlineBar: React.FC<{ score: number }> = ({ score }) => {
  const color = completenessColor(score);
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-[11px] tabular-nums" style={{ color }}>
        {score}%
      </span>
    </div>
  );
};

// ─── Table Skeleton ───────────────────────────────────────────────────────────

const TableSkeletonRows: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <tr key={i} className="border-b border-[var(--color-border)]/50">
        {[48, 100, 120, 80, 90, 80, 28].map((w, j) => (
          <td key={j} className="px-4 py-3">
            <Skeleton className="h-4 rounded" style={{ width: `${w}px` }} />
          </td>
        ))}
      </tr>
    ))}
  </>
);

// ─── Detail Panel ─────────────────────────────────────────────────────────────

const CanonicalRecordDetail: React.FC<{ record: CanonicalRecord }> = ({ record }) => {
  const score = toPercent(record.completeness_score);
  const fields = [
    { label: 'Canonical ID', value: String(record.canonical_id), note: '' },
    { label: 'Customer ID', value: record.cust_id, note: '' },
    { label: 'First Name', value: record.first_name, note: 'Normalized' },
    { label: 'Last Name', value: record.last_name, note: 'Normalized' },
    { label: 'Full Name', value: record.full_name, note: 'Derived' },
    { label: 'Email', value: record.email, note: record.email_valid ? 'Valid RFC-5322' : 'Failed validation' },
    { label: 'Phone', value: record.phone, note: record.phone_valid ? 'Valid E.164' : 'Failed validation' },
    { label: 'Birth Date', value: record.birth_date || '—', note: 'ISO-8601' },
    { label: 'Address', value: record.address || '—', note: '' },
    { label: 'City', value: record.city || '—', note: '' },
    { label: 'State', value: record.state || '—', note: '' },
    { label: 'Normalized At', value: formatDate(record.normalized_at), note: '' },
  ];

  return (
    <div className="space-y-6">
      {/* Completeness score */}
      <div className="panel-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
            Completeness Score
          </span>
          <StatusBadge status={completenessLabel(score)}>{score}%</StatusBadge>
        </div>
        <ConfidenceBar score={score} showPercentage={false} />
      </div>

      {/* Fields table */}
      <div>
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-3">
          All Fields
        </h3>
        <div className="panel-border rounded-lg overflow-hidden divide-y divide-[var(--color-border)]">
          {fields.map(({ label, value, note }) => (
            <div key={label} className="flex items-start px-4 py-2.5 gap-4 hover:bg-[var(--color-surface-2)]/40 transition-colors">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] w-28 shrink-0 pt-0.5">
                {label}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-xs text-[var(--color-text-primary)]">{value || '—'}</span>
                {note && (
                  <span className="font-mono text-[9px] text-[var(--color-text-muted)] italic">{note}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CanonicalExplorer() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [minCompleteness, setMinCompleteness] = useState(0);
  const [appliedMin, setAppliedMin] = useState(0);
  const [filterToIssues, setFilterToIssues] = useState(false);
  const [offset, setOffset] = useState(0);
  const [allRecords, setAllRecords] = useState<CanonicalRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<CanonicalRecord | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limit = 100;

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setOffset(0);
      setAllRecords([]);
    }, 350);
  };

  const applyCompleteness = () => {
    setAppliedMin(minCompleteness);
    setOffset(0);
    setAllRecords([]);
  };

  // Stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<CanonicalStats>({
    queryKey: ['canonical-stats'],
    queryFn: () => api.get('/canonical/stats').then(r => r.data),
  });

  // Quality issues
  const { data: qualityIssues } = useQuery<QualityIssues>({
    queryKey: ['canonical-quality-issues'],
    queryFn: () => api.get('/canonical/quality-issues').then(r => r.data),
  });

  // Records
  const {
    data: recordsData,
    isLoading: recordsLoading,
    isFetching,
    refetch: refetchRecords,
  } = useQuery<CanonicalRecordsResponse>({
    queryKey: ['canonical-records', debouncedSearch, appliedMin, offset, filterToIssues],
    queryFn: () =>
      api
        .get('/canonical/records', {
          params: {
            limit,
            offset,
            search: debouncedSearch || undefined,
            min_completeness: appliedMin || undefined,
            issues_only: filterToIssues || undefined,
          },
        })
        .then(r => r.data),
    placeholderData: (prev) => prev,
  });

  React.useEffect(() => {
    if (!recordsData?.records) return;
    if (offset === 0) {
      setAllRecords(recordsData.records);
    } else {
      setAllRecords(prev => {
        const ids = new Set(prev.map(r => r.canonical_id));
        return [...prev, ...recordsData.records.filter(r => !ids.has(r.canonical_id))];
      });
    }
  }, [recordsData, offset]);

  const handleRefresh = () => {
    setOffset(0);
    setAllRecords([]);
    refetchStats();
    refetchRecords();
  };

  const openPanel = (record: CanonicalRecord) => {
    setSelectedRecord(record);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setTimeout(() => setSelectedRecord(null), 300);
  };

  const handleFilterToIssues = () => {
    setFilterToIssues(true);
    setOffset(0);
    setAllRecords([]);
  };

  const hasMore = recordsData ? offset + limit < recordsData.total : false;
  const total = recordsData?.total ?? 0;

  return (
    <div className="space-y-5 animate-slide-up">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-primary)]/10 border border-[var(--color-accent-primary)]/30 flex items-center justify-center">
            <Layers size={18} className="text-[var(--color-accent-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-display font-semibold text-[var(--color-text-primary)]">
              Canonical Explorer
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] font-mono mt-0.5">
              Normalized &amp; Validated Records — Silver Layer
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {filterToIssues && (
            <button
              onClick={() => { setFilterToIssues(false); setOffset(0); setAllRecords([]); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-xs font-mono hover:bg-amber-500/10 transition-all"
            >
              <X size={12} />
              Clear Issues Filter
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)]/30 transition-all text-sm font-mono"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      <div className="panel-border rounded-xl overflow-hidden">
        <div className="flex flex-wrap">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col px-5 py-4 flex-1 border-r border-[var(--color-border)] last:border-r-0 space-y-2">
                <Skeleton className="h-2 w-16" />
                <Skeleton className="h-7 w-20" />
              </div>
            ))
          ) : stats ? (
            <>
              <StatTile label="Total Records" value={(stats.total ?? 0).toLocaleString()} />
              <StatTile
                label="Avg Completeness"
                value={`${Math.round(stats.avg_completeness ?? 0)}%`}
                accent={completenessColor(stats.avg_completeness ?? 0)}
              />
              <StatTile
                label="Valid Emails"
                value={`${Math.round(stats.valid_emails_pct ?? 0)}%`}
                accent="var(--color-success)"
              />
              <StatTile
                label="Valid Phones"
                value={`${Math.round(stats.valid_phones_pct ?? 0)}%`}
                accent="var(--color-success)"
              />
            </>
          ) : null}
        </div>
      </div>

      {/* ── Layer Quality KPIs ── */}
        <LayerKPIStats layerName="Canonical Layer" layerId={2} />

      {/* ── Quality Issues Banner ── */}
      <AnimatePresence>
        {qualityIssues && qualityIssues.total_issues > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/8"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-mono text-xs text-amber-600 dark:text-amber-400 font-semibold">
                  {qualityIssues.total_issues.toLocaleString()} quality issues detected
                </span>
                {qualityIssues.invalid_email > 0 && (
                  <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                    {qualityIssues.invalid_email} invalid emails
                  </span>
                )}
                {qualityIssues.invalid_phone > 0 && (
                  <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                    {qualityIssues.invalid_phone} invalid phones
                  </span>
                )}
                {qualityIssues.low_completeness > 0 && (
                  <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                    {qualityIssues.low_completeness} low completeness
                  </span>
                )}
              </div>
            </div>
            {!filterToIssues && (
              <button
                onClick={handleFilterToIssues}
                className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-all whitespace-nowrap"
              >
                Filter to Issues
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search + Filter Bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search by name, email, city…"
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] text-sm font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-primary)]/50 transition-colors"
          />
          {search && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Completeness slider */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)]">
          <SlidersHorizontal size={14} className="text-[var(--color-text-muted)]" />
          <span className="font-mono text-xs text-[var(--color-text-muted)] whitespace-nowrap">Min:</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minCompleteness}
            onChange={e => setMinCompleteness(Number(e.target.value))}
            onMouseUp={applyCompleteness}
            onTouchEnd={applyCompleteness}
            className="w-28 accent-[var(--color-accent-primary)]"
          />
          <span
            className="font-mono text-xs font-semibold tabular-nums w-8"
            style={{ color: completenessColor(minCompleteness) }}
          >
            {minCompleteness}%
          </span>
        </div>

        {total > 0 && (
          <span className="text-xs font-mono text-[var(--color-text-muted)] whitespace-nowrap ml-auto">
            {total.toLocaleString()} records
          </span>
        )}
      </div>

      {/* ── Table ── */}
      <div className="panel-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/50">
                {['Canonical ID', 'Full Name', 'Email', 'Phone', 'City, State', 'Completeness', ''].map(col => (
                  <th
                    key={col}
                    className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recordsLoading && offset === 0 ? (
                <TableSkeletonRows count={8} />
              ) : allRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-[var(--color-text-muted)]">
                      <Layers size={36} className="opacity-30" />
                      <p className="font-mono text-sm">No canonical records found</p>
                      {(debouncedSearch || appliedMin > 0) && (
                        <p className="text-xs">Try relaxing your search or filter</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                <AnimatePresence initial={false}>
                  {allRecords.map((record, idx) => {
                    const score = toPercent(record.completeness_score);
                    return (
                      <motion.tr
                        key={record.canonical_id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.3) }}
                        onClick={() => openPanel(record)}
                        className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-accent-primary)]/4 cursor-pointer transition-colors group"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">
                          #{record.canonical_id}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-primary)] font-medium whitespace-nowrap">
                          {record.full_name || '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <div className="flex items-center gap-1.5">
                            {record.email_valid ? (
                              <CheckCircle size={13} className="text-[var(--color-success)] shrink-0" />
                            ) : (
                              <XCircle size={13} className="text-[var(--color-danger)] shrink-0" />
                            )}
                            <span className="text-[var(--color-text-secondary)] truncate max-w-[160px]">
                              {record.email || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <div className="flex items-center gap-1.5">
                            {record.phone_valid ? (
                              <CheckCircle size={13} className="text-[var(--color-success)] shrink-0" />
                            ) : (
                              <XCircle size={13} className="text-[var(--color-danger)] shrink-0" />
                            )}
                            <span className="text-[var(--color-text-secondary)]">
                              {record.phone || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                          {[record.city, record.state].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="px-4 py-3 min-w-[130px]">
                          <InlineBar score={score} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-xs font-mono text-[var(--color-text-muted)] group-hover:text-[var(--color-accent-primary)] transition-colors">
                            View
                            <ChevronRight size={13} />
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              )}

              {isFetching && offset > 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center">
                    <span className="font-mono text-xs text-[var(--color-text-muted)] animate-pulse">Loading more…</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {hasMore && !isFetching && (
          <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/30 flex items-center justify-between">
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              Showing {allRecords.length.toLocaleString()} of {total.toLocaleString()}
            </span>
            <button
              onClick={() => setOffset(prev => prev + limit)}
              className="px-4 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] text-xs font-mono text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)]/30 transition-all"
            >
              Load More
            </button>
          </div>
        )}
        {!hasMore && allRecords.length > 0 && !isFetching && (
          <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/30">
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              All {total.toLocaleString()} records loaded
            </span>
          </div>
        )}
      </div>

      {/* ── Detail Panel ── */}
      <SidePanel
        isOpen={panelOpen}
        onClose={closePanel}
        title={
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-[var(--color-accent-primary)]" />
            <span>{selectedRecord?.full_name || `Record #${selectedRecord?.canonical_id}`}</span>
          </div>
        }
      >
        {selectedRecord && <CanonicalRecordDetail record={selectedRecord} />}
      </SidePanel>
    </div>
  );
}

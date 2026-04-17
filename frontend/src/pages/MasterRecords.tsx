import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Download,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Sparkles,
  RefreshCw,
  Database,
} from 'lucide-react';
import api from '@/api/client';
import { SidePanel } from '@/components/ui/SidePanel';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LayerKPIStats } from '@/components/ui/LayerKPIStats';
import { useToast } from '@/components/ui/Toast';
import type { MasterCorrectionExample, MasterRecord } from '@/types/api';
import { cn } from '@/lib/utils';

interface MasterStats {
  total_records: number;
  avg_confidence: number;
  avg_merged_count: number;
  multi_source_pct: number;
  singleton_count?: number;
  total?: number;
  merged_count?: number;
}

interface MasterApiResponse {
  records: MasterRecord[];
  total: number;
  limit: number;
  offset: number;
}

const LIMIT = 100;

// ─── Confidence bar (inline, small) ─────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const color =
    pct >= 80
      ? 'var(--color-success)'
      : pct >= 50
      ? 'var(--color-warning)'
      : 'var(--color-danger)';

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="font-mono font-bold text-xs tabular-nums shrink-0"
        style={{ color }}
      >
        {Math.round(pct)}%
      </span>
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="panel-border rounded-xl px-5 py-4 flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
        {label}
      </span>
      <span className="text-2xl font-display font-bold text-[var(--color-text-primary)]">
        {value}
      </span>
    </div>
  );
}

// ─── Side-panel detail ───────────────────────────────────────────────────────
function RecordDetail({
  record,
  onClose,
}: {
  record: MasterRecord;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [explainLoading, setExplainLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);

  const explain = async () => {
    setExplainLoading(true);
    setExplanation(null);
    try {
      const res = await api.post(`/ai/explain-record/${record.master_id}`);
      setExplanation(
        res.data?.explanation ?? res.data?.result ?? JSON.stringify(res.data)
      );
    } catch {
      toast('AI explanation unavailable', 'error');
    } finally {
      setExplainLoading(false);
    }
  };

  const Field = ({
    label,
    value,
  }: {
    label: string;
    value: React.ReactNode;
  }) => (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
        {label}
      </span>
      <span className="text-sm text-[var(--color-text-primary)] font-medium">
        {value ?? <span className="italic text-[var(--color-text-muted)]">—</span>}
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Core fields */}
      <div className="panel-border rounded-xl p-4 space-y-4">
        <Field label="Master ID" value={<span className="font-mono">{record.master_id}</span>} />
        <Field label="Full Name" value={record.full_name} />
        <Field label="Primary Email" value={record.email_primary} />
        <Field label="Phone" value={record.phone} />
        <Field label="Date of Birth" value={record.birth_date} />
        <Field label="Address" value={record.address} />
        <Field
          label="City / State"
          value={[record.city, record.state].filter(Boolean).join(', ')}
        />
      </div>

      {/* Confidence */}
      <div className="panel-border rounded-xl p-4 space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
          Confidence Score
        </p>
        <ConfidenceBar value={record.confidence_score} />
      </div>

      {/* All emails */}
      {record.emails_all && record.emails_all.length > 0 && (
        <div className="panel-border rounded-xl p-4 space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
            All Emails ({record.emails_all.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {record.emails_all.map((email, i) => (
              <span
                key={i}
                className="text-sm font-mono text-[var(--color-text-secondary)] truncate"
              >
                {email}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Source IDs */}
      {record.source_ids && record.source_ids.length > 0 && (
        <div className="panel-border rounded-xl p-4 space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
            Source IDs ({record.source_ids.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {record.source_ids.map((sid, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-secondary)] shrink-0" />
                <span className="text-xs font-mono text-[var(--color-text-secondary)]">
                  {sid}
                </span>
                {record.source_systems?.[i] && (
                  <span className="text-[10px] font-mono text-[var(--color-text-muted)] px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border)]">
                    {record.source_systems[i]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Explain merge */}
      <div className="panel-border rounded-xl p-4 bg-gradient-to-br from-[var(--color-accent-secondary)]/8 via-[var(--color-surface-1)] to-[var(--color-surface-1)] border-[var(--color-accent-secondary)]/25">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--color-accent-secondary)]" />
            <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-accent-secondary)] font-bold">
              AI Intelligence
            </span>
          </div>
          <button
            onClick={explain}
            disabled={explainLoading}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all',
              'bg-[var(--color-accent-secondary)]/15 text-[var(--color-accent-secondary)] border border-[var(--color-accent-secondary)]/40',
              'hover:bg-[var(--color-accent-secondary)]/25 hover:border-[var(--color-accent-secondary)]/70',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            {explainLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            Explain this merge
          </button>
        </div>

        {explainLoading && (
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-full rounded" />
            <Skeleton className="h-3.5 w-4/5 rounded" />
            <Skeleton className="h-3.5 w-3/5 rounded" />
          </div>
        )}

        {!explainLoading && explanation && (
          <AnimatePresence>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-[var(--color-text-secondary)] leading-relaxed"
            >
              {explanation}
            </motion.p>
          </AnimatePresence>
        )}

        {!explainLoading && !explanation && (
          <p className="text-xs font-mono text-[var(--color-text-muted)] italic">
            Click "Explain this merge" to understand how these records were unified.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MasterRecords() {
  const { toast } = useToast();

  const [records, setRecords] = useState<MasterRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<MasterStats | null>(null);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<MasterRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const [corrections, setCorrections] = useState<MasterCorrectionExample[]>([]);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [selectedSystems, setSelectedSystems] = useState<Set<string>>(new Set());
  const [loading_db, setLoadingDb] = useState(false);

  const searchDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchRecords = useCallback(
    async (q: string, off: number) => {
      setLoading(true);
      try {
        const res = await api.get<MasterApiResponse>('/master/records', {
          params: { limit: LIMIT, offset: off, ...(q ? { search: q } : {}) },
        });
        const data = res.data;
        setRecords(data?.records ?? data ?? []);
        setTotal(data?.total ?? (data?.records ?? data ?? []).length);
        setOffset(off);
      } catch {
        toast('Failed to load master records', 'error');
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/master/stats');
      setStats(res.data);
    } catch {
      // non-fatal
    }
  }, []);

  const fetchCorrectionsPreview = useCallback(async () => {
    try {
      const res = await api.get('/master/corrections-preview', { params: { limit: 2 } });
      setCorrections(res.data?.examples ?? []);
    } catch {
      setCorrections([]);
    }
  }, []);

  const applyCorrection = useCallback(
    async (example: MasterCorrectionExample, correction: MasterCorrectionExample['corrections'][number]) => {
      const key = `${example.cust_id}:${correction.field_name}`;
      setApplyingKey(key);
      try {
        await api.post('/master/apply-correction', {
          master_id: Number(example.master.master_id),
          field_name: correction.field_name,
          proposed_value: correction.proposed_value,
          source_record_id: example.cust_id,
          confidence: correction.confidence,
          applied_by: 'USER',
        });
        toast(`Applied ${correction.field_name} correction`, 'success');
        await Promise.all([fetchStats(), fetchCorrectionsPreview(), fetchRecords(search, offset)]);
      } catch {
        toast(`Failed to apply ${correction.field_name}`, 'error');
      } finally {
        setApplyingKey(null);
      }
    },
    [fetchCorrectionsPreview, fetchRecords, fetchStats, offset, search, toast]
  );

  useEffect(() => {
    fetchStats();
    fetchCorrectionsPreview();
    fetchRecords('', 0);
  }, []);

  // ── Search with debounce ──────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      fetchRecords(search, 0);
    }, 350);
    return () => clearTimeout(searchDebounce.current);
  }, [search]);

  // ── CSV export ────────────────────────────────────────────────────────────
  const exportCSV = async () => {
    setExporting(true);
    try {
      const res = await api.get('/master/export', {
        params: { format: 'csv' },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `master-records-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Export started', 'success');
    } catch {
      toast('Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  // ── Load to Database ───────────────────────────────────────────────────────
  const loadToDatabase = async () => {
    setLoadingDb(true);
    try {
      const filteredRecords = selectedSystems.size === 0 
        ? records 
        : records.filter(rec => 
            rec.source_systems?.some(sys => selectedSystems.has(sys))
          );

      const res = await api.post('/master/load-to-db', {
        records: filteredRecords,
        filters: {
          selected_systems: Array.from(selectedSystems),
          search: search,
        }
      });
      toast(res.data?.message || 'Data loaded to database successfully', 'success');
    } catch (error: any) {
      toast(error?.response?.data?.detail || 'Failed to load data to database', 'error');
    } finally {
      setLoadingDb(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  // Get unique systems from all records
  const availableSystems = Array.from(
    new Set(records.flatMap(r => r.source_systems || []))
  ).sort();

  return (
    <div className="flex flex-col gap-6 animate-slide-up">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold text-[var(--color-text-primary)]">
            Master Records
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5 font-mono">
            Unified Customer Truth
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadToDatabase}
            disabled={loading_db || records.length === 0}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl panel-border font-mono text-sm font-bold uppercase tracking-wider transition-all',
              'text-[var(--color-accent-secondary)] hover:border-[var(--color-accent-secondary)] border-[var(--color-accent-secondary)]/30',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
            title={records.length === 0 ? 'No records to load' : 'Load filtered records to database'}
          >
            {loading_db ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
            Load to DB
          </button>
          <button
            onClick={exportCSV}
            disabled={exporting}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl panel-border font-mono text-sm font-bold uppercase tracking-wider transition-all',
              'text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)]',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export CSV
          </button>
        </div>
      </div>


      {/* ── Stats row ───────────────────────────────────────────────────── */}
      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Records" value={(stats.total_records ?? stats.total ?? 0).toLocaleString()} />
          <StatCard label="Avg Confidence" value={`${(stats.avg_confidence ?? 0).toFixed(1)}%`} />
          <StatCard
            label="Avg Source Count"
            value={(stats.avg_merged_count ?? 0).toFixed(1)}
          />
          <StatCard
            label="Multi-Source %"
            value={`${(stats.multi_source_pct ?? 0).toFixed(1)}%`}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {/* ── Layer Quality KPIs ── */}
      <LayerKPIStats layerName="Master Records" layerId={4} />

      {/* ── Correction Preview ── */}
      <div className="panel-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              Proposed Corrections
            </h2>
            <p className="text-[11px] font-mono text-[var(--color-text-muted)] mt-1">
              Apply a proposed field correction directly to the selected master record.
            </p>
          </div>
          <button
            onClick={fetchCorrectionsPreview}
            className="flex items-center gap-2 px-3 py-2 rounded-xl panel-border font-mono text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)] transition-colors"
          >
            <RefreshCw size={14} />
            Refresh Preview
          </button>
        </div>

        {corrections.length === 0 ? (
          <div className="py-6 text-center text-[var(--color-text-muted)] font-mono text-sm">
            No correction candidates found right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {corrections.map((example) => (
              <div key={example.cust_id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                      Source {example.cust_id}
                    </p>
                    <p className="text-sm text-[var(--color-text-primary)] font-medium">{example.raw.full_name || 'Unnamed source'}</p>
                  </div>
                  <StatusBadge status="WARN">{example.corrections.length} correction{example.corrections.length === 1 ? '' : 's'}</StatusBadge>
                </div>
                <div className="text-[11px] font-mono text-[var(--color-text-muted)] space-y-1">
                  <p>Master: {example.master.full_name} · {example.master.master_id}</p>
                  <p>{[example.master.email, example.master.phone, example.master.city].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="space-y-2">
                  {example.corrections.map((correction) => {
                    const key = `${example.cust_id}:${correction.field_name}`;
                    const pending = applyingKey === key;
                    return (
                      <div key={key} className="rounded-lg border border-[var(--color-border)]/80 bg-[var(--color-surface-2)]/60 px-3 py-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                            {correction.field_name}
                          </p>
                          <p className="text-xs text-[var(--color-text-secondary)] truncate">
                            Current: <span className="text-[var(--color-text-primary)]">{correction.current_value || '—'}</span>
                          </p>
                          <p className="text-xs text-[var(--color-text-secondary)] truncate">
                            Proposed: <span className="text-[var(--color-success)]">{correction.proposed_value || '—'}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[10px] text-[var(--color-text-muted)]">{Math.round(correction.confidence)}%</span>
                          <button
                            onClick={() => applyCorrection(example, correction)}
                            disabled={pending}
                            className="px-3 py-1.5 rounded-lg bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] border border-[var(--color-accent-primary)]/30 font-mono text-[10px] uppercase tracking-widest disabled:opacity-50"
                          >
                            {pending ? 'Applying' : 'Apply'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Search & filters ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Table Source Filters */}
        {availableSystems.length > 0 && (
          <div className="panel-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                📊 Filter by Source Table
              </p>
              {selectedSystems.size > 0 && (
                <button
                  onClick={() => setSelectedSystems(new Set())}
                  className="text-xs font-mono text-[var(--color-accent-primary)] hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {availableSystems.map((system) => (
                <label
                  key={system}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)] cursor-pointer hover:border-[var(--color-accent-primary)] transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedSystems.has(system)}
                    onChange={(e) => {
                      const newSystems = new Set(selectedSystems);
                      if (e.target.checked) {
                        newSystems.add(system);
                      } else {
                        newSystems.delete(system);
                      }
                      setSelectedSystems(newSystems);
                    }}
                    className="w-4 h-4 rounded accent-[var(--color-accent-primary)]"
                  />
                  <span className="text-sm font-mono text-[var(--color-text-secondary)]">
                    {system}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    ({records.filter(r => r.source_systems?.includes(system)).length})
                  </span>
                </label>
              ))}
            </div>
            {selectedSystems.size > 0 && (
              <div className="text-xs font-mono text-[var(--color-accent-secondary)]">
                📌 Showing {records.filter(r => r.source_systems?.some(sys => selectedSystems.has(sys))).length} of {records.length} records
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or ID…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl panel-border bg-transparent font-mono text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-primary)] transition-colors"
            />
          </div>
          <button
            onClick={() => fetchRecords(search, offset)}
            className="p-2.5 rounded-xl panel-border text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="panel-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-[var(--color-border)]">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-36 rounded" />
                <Skeleton className="h-4 w-48 rounded flex-1" />
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-32 rounded" />
              </div>
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Database size={32} className="text-[var(--color-text-muted)]" />
            <p className="font-mono text-sm text-[var(--color-text-muted)]">
              No records found{search ? ` for "${search}"` : ''}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                  {[
                    'Master ID',
                    'Name',
                    'Email',
                    'Phone',
                    'City',
                    'Sources',
                    'Confidence',
                    'Merged',
                    '',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]/60">
                <AnimatePresence>
                  {records.map((rec, idx) => (
                    <motion.tr
                      key={rec.master_id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      onClick={() => setSelectedRecord(rec)}
                      className="group hover:bg-[var(--color-surface-2)] cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-[var(--color-accent-secondary)]">
                          {rec.master_id}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-sm text-[var(--color-text-primary)] whitespace-nowrap">
                          {rec.full_name ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <span className="text-sm text-[var(--color-text-secondary)] font-mono truncate block">
                          {rec.email_primary ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-[var(--color-text-secondary)] font-mono whitespace-nowrap">
                          {rec.phone ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
                          {[rec.city, rec.state].filter(Boolean).join(', ') || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-[var(--color-text-muted)]">
                          {rec.source_systems?.join(', ') || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ConfidenceBar value={rec.confidence_score} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-mono font-bold',
                            (rec.record_count ?? 1) > 1
                              ? 'bg-[var(--color-warning)]/15 text-[var(--color-warning)] border border-[var(--color-warning)]/30'
                              : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                          )}
                        >
                          {rec.record_count ?? 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight
                          size={14}
                          className="text-[var(--color-text-muted)] group-hover:text-[var(--color-accent-primary)] transition-colors"
                        />
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      {total > LIMIT && (
        <div className="flex items-center justify-between px-1">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            Page {currentPage} of {totalPages} &middot; {total.toLocaleString()} records
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchRecords(search, offset - LIMIT)}
              disabled={offset === 0 || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg panel-border font-mono text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              onClick={() => fetchRecords(search, offset + LIMIT)}
              disabled={offset + LIMIT >= total || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg panel-border font-mono text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Side panel ──────────────────────────────────────────────────── */}
      <SidePanel
        isOpen={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        title={
          selectedRecord ? (
            <span className="flex items-center gap-2">
              <Database size={16} className="text-[var(--color-accent-secondary)]" />
              {selectedRecord.full_name ?? 'Record Detail'}
            </span>
          ) : (
            'Record Detail'
          )
        }
      >
        {selectedRecord && (
          <RecordDetail
            record={selectedRecord}
            onClose={() => setSelectedRecord(null)}
          />
        )}
      </SidePanel>
    </div>
  );
}

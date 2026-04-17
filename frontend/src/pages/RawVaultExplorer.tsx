import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, RefreshCw, Search, ChevronRight, Lock, X } from 'lucide-react';
import api from '@/api/client';
import { Skeleton } from '@/components/ui/Skeleton';
import { SidePanel } from '@/components/ui/SidePanel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LayerKPIStats } from '@/components/ui/LayerKPIStats';
import type { VaultRecord } from '@/types/api';

interface VaultRecordsResponse {
  records: VaultRecord[];
  total: number;
  offset: number;
  limit: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
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

function formatDateShort(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function parseValidityMap(validity: VaultRecord['format_validity']): Record<string, boolean> {
  if (!validity) return {};
  if (typeof validity === 'string') {
    try {
      const parsed = JSON.parse(validity);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return validity;
}

function validityStats(validity: VaultRecord['format_validity']) {
  const map = parseValidityMap(validity);
  const values = Object.values(map);
  if (values.length === 0) {
    return { total: 0, valid: 0, invalid: 0, pct: 100 };
  }
  const valid = values.filter(Boolean).length;
  const invalid = values.length - valid;
  return {
    total: values.length,
    valid,
    invalid,
    pct: Math.round((valid / values.length) * 100),
  };
}

function correctnessScore(record: VaultRecord): number {
  const completeness = Number(record.raw_completeness ?? 0);
  const validityPct = validityStats(record.format_validity).pct;
  const dlqPenalty = record.dlq_flag ? 30 : 0;
  const score = Math.round(completeness * 0.55 + validityPct * 0.45 - dlqPenalty);
  return Math.max(0, Math.min(100, score));
}

// ─── Skeleton Rows ────────────────────────────────────────────────────────────

const TableSkeletonRows: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <tr key={i} className="border-b border-[var(--color-border)]/50">
        {[40, 80, 72, 56, 96, 28].map((w, j) => (
          <td key={j} className="px-4 py-3">
            <Skeleton className={`h-4 w-${w}`} style={{ width: `${w * 3}px` }} />
          </td>
        ))}
      </tr>
    ))}
  </>
);

// ─── Detail Panel Content ─────────────────────────────────────────────────────

const VaultRecordDetail: React.FC<{ record: VaultRecord }> = ({ record }) => {
  const prettyJson = JSON.stringify(record.raw_payload, null, 2);
  const validity = validityStats(record.format_validity);
  const quality = correctnessScore(record);

  return (
    <div className="space-y-4">
      {/* Kafka Metadata */}
      <div>
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-3">
          Kafka Metadata
        </h3>
        <div className="panel-border rounded-lg overflow-hidden divide-y divide-[var(--color-border)]">
          {[
            { label: 'Vault ID', value: `#${record.vault_id}` },
            { label: 'Customer ID', value: record.cust_id },
            { label: 'Source System', value: record.source_system },
            { label: 'Kafka Offset', value: String(record.kafka_offset) },
            { label: 'Kafka Partition', value: String(record.kafka_partition) },
            { label: 'Ingested At', value: formatDate(record.ingested_at) },
            { label: 'Raw Completeness', value: `${Math.round(record.raw_completeness ?? 0)}%` },
            { label: 'Format Validity', value: `${validity.pct}% (${validity.valid}/${validity.total || 0})` },
            { label: 'Correctness Score', value: `${quality}%` },
            { label: 'DLQ Status', value: record.dlq_flag ? `Flagged${record.dlq_reason ? `: ${record.dlq_reason}` : ''}` : 'Clean' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center px-3 py-2 gap-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] w-32 shrink-0">
                {label}
              </span>
              <span className="font-mono text-xs text-[var(--color-text-primary)] break-all">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Raw Payload */}
      <div>
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-3">
          Raw Payload
        </h3>
        <div className="panel-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-2)] border-b border-[var(--color-border)]">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">JSON</span>
            <StatusBadge status="WARN">Immutable</StatusBadge>
          </div>
          <pre className="p-4 text-xs font-code text-[var(--color-text-secondary)] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
            {prettyJson}
          </pre>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RawVaultExplorer() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [allRecords, setAllRecords] = useState<VaultRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<VaultRecord | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const limit = 100;

  // Debounce search
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setOffset(0);
      setAllRecords([]);
    }, 350);
  };

  // Records query
  const {
    data: recordsData,
    isLoading: recordsLoading,
    isFetching,
    refetch: refetchRecords,
  } = useQuery<VaultRecordsResponse>({
    queryKey: ['vault-records', debouncedSearch, offset],
    queryFn: () =>
      api
        .get('/vault/records', { params: { limit, offset, search: debouncedSearch || undefined } })
        .then(r => r.data),
    placeholderData: (prev) => prev,
  });

  // Accumulate records for load-more
  React.useEffect(() => {
    if (!recordsData?.records) return;
    if (offset === 0) {
      setAllRecords(recordsData.records);
    } else {
      setAllRecords(prev => {
        const existingIds = new Set(prev.map(r => r.vault_id));
        const newOnes = recordsData.records.filter(r => !existingIds.has(r.vault_id));
        return [...prev, ...newOnes];
      });
    }
  }, [recordsData, offset]);

  const handleRefresh = useCallback(() => {
    setOffset(0);
    setAllRecords([]);
    refetchRecords();
  }, [refetchRecords]);

  const handleLoadMore = () => {
    setOffset(prev => prev + limit);
  };

  const openPanel = (record: VaultRecord) => {
    setSelectedRecord(record);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setTimeout(() => setSelectedRecord(null), 300);
  };

  const hasMore = recordsData ? offset + limit < recordsData.total : false;
  const total = recordsData?.total ?? 0;

  return (
    <div className="space-y-4 animate-slide-up">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <Database size={18} className="text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-display font-semibold text-[var(--color-text-primary)]">
                Raw Vault
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                <Lock size={9} />
                Immutable
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] font-mono mt-0.5">
              Immutable Event Store — Bronze Layer
            </p>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)]/30 transition-all text-xs font-mono"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Layer Quality KPIs ── */}
      <LayerKPIStats layerName="Raw Vault" layerId={1} />

      {/* ── Search Bar ── */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search by Customer ID, Source System…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] text-xs font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-primary)]/50 transition-colors"
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
        {total > 0 && (
          <span className="text-xs font-mono text-[var(--color-text-muted)] whitespace-nowrap">
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
                {['Vault ID', 'Customer ID', 'Source', 'Completeness', 'Validity', 'Correctness', 'Invalid', 'DLQ', 'Ingested At', ''].map(col => (
                  <th
                    key={col}
                    className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] whitespace-nowrap"
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
                  <td colSpan={10} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-[var(--color-text-muted)]">
                      <Database size={36} className="opacity-30" />
                      <p className="font-mono text-sm">No vault records found</p>
                      {debouncedSearch && (
                        <p className="text-xs">Try adjusting your search query</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                <AnimatePresence initial={false}>
                  {allRecords.map((record, idx) => (
                    <motion.tr
                      key={record.vault_id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.3) }}
                      onClick={() => openPanel(record)}
                      className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-accent-primary)]/4 cursor-pointer transition-colors group"
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-muted)]">
                        #{record.vault_id}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-primary)] font-medium">
                        {record.cust_id}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-[var(--color-accent-primary)]/8 text-[var(--color-accent-primary)] border border-[var(--color-accent-primary)]/20">
                          {record.source_system}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-secondary)] tabular-nums">
                        {Math.round(record.raw_completeness ?? 0)}%
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-secondary)] tabular-nums">
                        {validityStats(record.format_validity).pct}%
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs tabular-nums">
                        <span className={correctnessScore(record) >= 85 ? 'text-emerald-600 dark:text-emerald-300' : correctnessScore(record) >= 65 ? 'text-amber-600 dark:text-amber-300' : 'text-rose-600 dark:text-rose-300'}>
                          {correctnessScore(record)}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-secondary)] tabular-nums">
                        {validityStats(record.format_validity).invalid}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">
                        {record.dlq_flag ? 'Y' : 'N'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                        {formatDateShort(record.ingested_at)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 text-xs font-mono text-[var(--color-text-muted)] group-hover:text-[var(--color-accent-primary)] transition-colors">
                          View
                          <ChevronRight size={13} />
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}

              {/* Load-more spinner row */}
              {isFetching && offset > 0 && (
                <tr>
                  <td colSpan={10} className="py-4 text-center">
                    <span className="font-mono text-xs text-[var(--color-text-muted)] animate-pulse">
                      Loading more…
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Load More */}
        {hasMore && !isFetching && (
          <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/30 flex items-center justify-between">
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              Showing {allRecords.length.toLocaleString()} of {total.toLocaleString()}
            </span>
            <button
              onClick={handleLoadMore}
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

      {/* ── Detail Side Panel ── */}
      <SidePanel
        isOpen={panelOpen}
        onClose={closePanel}
        title={
          <div className="flex items-center gap-2">
            <Lock size={15} className="text-amber-500" />
            <span>Vault Record #{selectedRecord?.vault_id}</span>
          </div>
        }
      >
        {selectedRecord && <VaultRecordDetail record={selectedRecord} />}
      </SidePanel>
    </div>
  );
}

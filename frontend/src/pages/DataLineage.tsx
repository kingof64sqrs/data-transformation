import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Loader2,
  GitBranch,
  Clock,
  AlertCircle,
  X,
  Plus,
  Minus,
} from 'lucide-react';
import api from '@/api/client';
import { SidePanel } from '@/components/ui/SidePanel';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import type { LineageResult } from '@/types/api';
import { cn } from '@/lib/utils';

interface SearchSuggestion {
  cust_id: string;
  name?: string;
  email?: string;
}

// ─── Pipeline stage icons ─────────────────────────────────────────────────────
const STAGE_META: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  source: { label: 'Source', icon: '⬡', color: 'var(--color-accent-primary)' },
  vault: { label: 'Raw Vault', icon: '⬢', color: 'var(--color-warning)' },
  canonical: { label: 'Canonical', icon: '◈', color: 'var(--color-accent-secondary)' },
  identity: { label: 'Identity Graph', icon: '⬟', color: '#EC4899' },
  master: { label: 'Master Record', icon: '★', color: 'var(--color-success)' },
};

const STAGE_KEY_BY_LABEL: Record<string, string> = {
  source: 'source',
  'raw vault': 'vault',
  vault: 'vault',
  canonical: 'canonical',
  'identity graph': 'identity',
  identity: 'identity',
  'master record': 'master',
  master: 'master',
};

function resolveStageKey(value: string): string {
  return STAGE_KEY_BY_LABEL[value.toLowerCase()] ?? value.toLowerCase();
}

function MindNode({
  id,
  x,
  y,
  title,
  subtitle,
  icon,
  color,
  active,
  disabled,
  onClick,
}: {
  id: string;
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  icon: string;
  color: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.button
      layout
      key={id}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.04 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      className={cn(
        'absolute -translate-x-1/2 -translate-y-1/2 w-[170px] rounded-xl border p-3 text-left transition-all',
        disabled
          ? 'opacity-45 border-dashed border-[var(--color-border)] cursor-not-allowed'
          : 'panel-border hover:border-[var(--color-accent-secondary)]'
      )}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        backgroundColor: 'var(--color-surface-1)',
        borderColor: active && !disabled ? color : undefined,
        boxShadow: active && !disabled ? `0 0 20px ${color}35` : undefined,
      }}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none" style={{ color }}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest font-bold" style={{ color }}>
            {title}
          </p>
          <p className="text-xs text-[var(--color-text-primary)] mt-1 truncate">
            {subtitle || 'Not found'}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Timeline entry ───────────────────────────────────────────────────────────
function TimelineEntry({
  entry,
  index,
}: {
  entry: { stage: string; event: string; ts: string };
  index: number;
}) {
  const stageKey = resolveStageKey(entry.stage);
  const meta = STAGE_META[stageKey] ?? {
    label: entry.stage,
    icon: '◉',
    color: 'var(--color-text-muted)',
  };
  const date = new Date(entry.ts);
  const formatted = isNaN(date.getTime())
    ? entry.ts
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-start gap-4"
    >
      {/* Timeline dot */}
      <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
        <div
          className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0"
          style={{
            borderColor: meta.color,
            color: meta.color,
            backgroundColor: `${meta.color}15`,
          }}
        >
          {meta.icon}
        </div>
        <div
          className="w-0.5 flex-1 min-h-[24px]"
          style={{ backgroundColor: `${meta.color}30` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-mono text-[10px] uppercase tracking-widest font-bold"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
          <span className="text-[10px] font-mono text-[var(--color-text-muted)] flex items-center gap-1">
            <Clock size={10} /> {formatted}
          </span>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1 leading-relaxed">
          {entry.event}
        </p>
      </div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DataLineage() {
  const { toast } = useToast();

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const [custId, setCustId] = useState<string | null>(null);
  const [lineage, setLineage] = useState<LineageResult | null>(null);
  const [lineageLoading, setLineageLoading] = useState(false);

  const [panelStage, setPanelStage] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Suggestions ───────────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      return;
    }
    setSuggestLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get('/lineage-search', { params: { q: query } });
        const data = res.data;
        const list: SearchSuggestion[] = Array.isArray(data)
          ? data
          : data?.results ?? data?.suggestions ?? [];
        setSuggestions(list);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // ── Fetch lineage ─────────────────────────────────────────────────────────
  const loadLineage = useCallback(
    async (id: string) => {
      setCustId(id);
      setLineage(null);
      setLineageLoading(true);
      setShowSuggestions(false);
      try {
        const res = await api.get(`/lineage/${id}`);
        setLineage(res.data);
      } catch {
        toast('Failed to load lineage data', 'error');
      } finally {
        setLineageLoading(false);
      }
    },
    [toast]
  );

  // ── Click outside to close suggestions ───────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Build stage data from lineage ─────────────────────────────────────────
  const stages = lineage
    ? [
        { key: 'source', data: lineage.source },
        { key: 'vault', data: lineage.vault },
        { key: 'canonical', data: lineage.canonical },
        {
          key: 'identity',
          data:
            lineage.matches && lineage.matches.length > 0
              ? { matches: lineage.matches.length, top: lineage.matches[0] }
              : null,
        },
        { key: 'master', data: lineage.master as unknown as Record<string, unknown> | null },
      ]
    : [];

  const getPanelData = (): Record<string, unknown> | null => {
    if (!panelStage || !lineage) return null;
    if (panelStage === 'source') return lineage.source;
    if (panelStage === 'vault') return lineage.vault;
    if (panelStage === 'canonical') return lineage.canonical;
    if (panelStage === 'identity')
      return lineage.matches?.length > 0
        ? { matches_count: lineage.matches.length, matches: lineage.matches }
        : null;
    if (panelStage === 'master') return lineage.master as unknown as Record<string, unknown>;
    return null;
  };

  const panelData = getPanelData();

  return (
    <div className="flex flex-col gap-6 animate-slide-up">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-display font-bold text-[var(--color-text-primary)]">
          Data Lineage
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5 font-mono">
          Full audit trail — trace a record through every pipeline stage
        </p>
      </div>

      {/* ── Search box ──────────────────────────────────────────────────── */}
      <div ref={searchRef} className="relative max-w-xl">
        <div className="relative flex items-center">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Search by Customer ID, Name, or Email…"
            className="w-full pl-10 pr-10 py-3 rounded-xl panel-border bg-transparent font-mono text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-primary)] transition-colors"
          />
          {suggestLoading && (
            <Loader2
              size={14}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-accent-secondary)] animate-spin"
            />
          )}
          {query && !suggestLoading && (
            <button
              onClick={() => {
                setQuery('');
                setSuggestions([]);
                setShowSuggestions(false);
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Suggestions dropdown */}
        <AnimatePresence>
          {showSuggestions && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 right-0 mt-2 panel-border rounded-xl overflow-hidden z-30 bg-[var(--color-surface-1)]"
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.cust_id ?? i}
                  onClick={() => {
                    setQuery(s.cust_id);
                    loadLineage(s.cust_id);
                  }}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--color-surface-2)] transition-colors text-left border-b border-[var(--color-border)] last:border-b-0"
                >
                  <GitBranch
                    size={13}
                    className="text-[var(--color-accent-secondary)] shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-[var(--color-text-primary)] truncate">
                      {s.cust_id}
                    </p>
                    {(s.name || s.email) && (
                      <p className="text-xs text-[var(--color-text-muted)] truncate">
                        {[s.name, s.email].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!custId && !lineageLoading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 gap-5 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-accent-secondary)]/10 border border-[var(--color-accent-secondary)]/25 flex items-center justify-center">
            <GitBranch size={28} className="text-[var(--color-accent-secondary)]" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-[var(--color-text-primary)]">
              Trace a customer record
            </h2>
            <p className="text-sm font-mono text-[var(--color-text-muted)] mt-1.5">
              Search for a Customer ID, name, or email to see how a record<br />
              traveled through each pipeline stage.
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {lineageLoading && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            {[...Array(5)].map((_, i) => (
              <React.Fragment key={i}>
                <Skeleton className="h-24 w-[130px] rounded-xl shrink-0" />
                {i < 4 && <Skeleton className="h-3 w-14 rounded" />}
              </React.Fragment>
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {/* ── Lineage visualization ─────────────────────────────────────────── */}
      {lineage && !lineageLoading && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Customer header */}
          <div className="flex items-center gap-3">
            <div className="panel-border rounded-lg px-4 py-2.5 flex items-center gap-3">
              <span className="font-mono text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                Customer
              </span>
              <span className="font-mono font-bold text-[var(--color-accent-secondary)]">
                {lineage.cust_id}
              </span>
            </div>
            <StatusBadge
              status={lineage.master ? 'SUCCESS' : lineage.canonical ? 'WARN' : 'DANGER'}
            >
              {lineage.master ? 'Fully resolved' : lineage.canonical ? 'Partial' : 'Incomplete'}
            </StatusBadge>
          </div>

          {/* Pipeline flow */}
          <div className="panel-border rounded-xl p-6 overflow-x-auto">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1">
                  Lineage Graph
                </p>
                <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  Source to master lineage map with identity branches.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.1).toFixed(2))))}
                  className="h-8 w-8 rounded-md border border-[var(--color-border)] hover:border-[var(--color-accent-primary)] flex items-center justify-center text-[var(--color-text-secondary)]"
                  title="Zoom out"
                >
                  <Minus size={14} />
                </button>
                <span className="min-w-[52px] text-center text-xs font-mono text-[var(--color-text-muted)]">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(1.25, Number((z + 0.1).toFixed(2))))}
                  className="h-8 w-8 rounded-md border border-[var(--color-border)] hover:border-[var(--color-accent-primary)] flex items-center justify-center text-[var(--color-text-secondary)]"
                  title="Zoom in"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className="relative min-h-[520px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/20 overflow-auto">
              <div className="relative w-full h-full min-w-[1100px] min-h-[520px]" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {[
                    ['source', 'vault'],
                    ['vault', 'canonical'],
                    ['canonical', 'identity'],
                    ['canonical', 'master'],
                  ].map(([from, to]) => {
                    const coords: Record<string, [number, number]> = {
                      source: [12, 50],
                      vault: [30, 50],
                      canonical: [48, 50],
                      identity: [68, 30],
                      master: [68, 70],
                    };
                    const [x1, y1] = coords[from];
                    const [x2, y2] = coords[to];
                    return (
                      <line
                        key={`${from}-${to}`}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="var(--color-border)"
                        strokeWidth="0.42"
                        strokeDasharray="1.1 0.8"
                      />
                    );
                  })}

                  {lineage.matches?.slice(0, 5).map((_, idx) => {
                    const py = 16 + idx * 14;
                    return (
                      <line
                        key={`identity-partner-${idx}`}
                        x1={68}
                        y1={30}
                        x2={88}
                        y2={py}
                        stroke="#EC4899"
                        strokeWidth="0.34"
                        strokeOpacity="0.55"
                      />
                    );
                  })}
                </svg>

                {stages.map((stage) => {
                  const coords: Record<string, [number, number]> = {
                    source: [12, 50],
                    vault: [30, 50],
                    canonical: [48, 50],
                    identity: [68, 30],
                    master: [68, 70],
                  };
                  const [x, y] = coords[stage.key] ?? [50, 50];
                  const meta = STAGE_META[stage.key] ?? {
                    label: stage.key,
                    icon: '◉',
                    color: 'var(--color-text-muted)',
                  };

                  const subtitle = stage.data
                    ? String(
                        (stage.data as Record<string, unknown>)?.full_name ??
                          (stage.data as Record<string, unknown>)?.cust_id ??
                          (stage.data as Record<string, unknown>)?.master_id ??
                          ((stage.key === 'identity' && lineage.matches?.length)
                            ? `${lineage.matches.length} linked matches`
                            : 'Available')
                      )
                    : undefined;

                  return (
                    <MindNode
                      key={stage.key}
                      id={stage.key}
                      x={x}
                      y={y}
                      title={meta.label}
                      subtitle={subtitle}
                      icon={meta.icon}
                      color={meta.color}
                      active={activeStage === stage.key}
                      disabled={!stage.data}
                      onClick={() => {
                        if (stage.data) {
                          setPanelStage(stage.key);
                          setActiveStage(stage.key);
                        }
                      }}
                    />
                  );
                })}

                {lineage.matches?.slice(0, 5).map((m, idx) => (
                  <MindNode
                    key={`partner-${m.match_id}`}
                    id={`partner-${m.match_id}`}
                    x={88}
                    y={16 + idx * 14}
                    title="Linked Identity"
                    subtitle={m.partner_name || m.partner_cust_id}
                    icon="◌"
                    color="#EC4899"
                    onClick={() => {
                      setPanelStage('identity');
                      setActiveStage('identity');
                    }}
                  />
                ))}
              </div>

              <div className="absolute left-4 bottom-4 flex items-center gap-4 text-[10px] font-mono text-[var(--color-text-muted)] bg-[var(--color-surface-1)]/80 border border-[var(--color-border)] rounded-md px-3 py-2">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--color-accent-primary)]" /> Source</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--color-warning)]" /> Vault</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--color-accent-secondary)]" /> Canonical</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#EC4899]" /> Identity</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--color-success)]" /> Master</span>
              </div>
            </div>
          </div>

          {/* Identity matches summary */}
          {lineage.matches && lineage.matches.length > 0 && (
            <div className="panel-border rounded-xl p-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-4">
                Identity Matches ({lineage.matches.length})
              </p>
              <div className="space-y-2">
                {lineage.matches.map((m) => (
                  <div
                    key={m.match_id}
                    className="flex items-center gap-4 px-3 py-2.5 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)]"
                  >
                    <span className="font-mono text-xs text-[var(--color-text-muted)]">
                      #{m.match_id}
                    </span>
                    <span className="flex-1 text-sm text-[var(--color-text-primary)] truncate">
                      vs {m.partner_name ?? m.partner_cust_id}
                    </span>
                    <span className="font-mono text-xs text-[var(--color-text-muted)]">
                      score: {Math.round(m.composite_score ?? 0)}%
                    </span>
                    <StatusBadge
                      status={
                        m.decision === 'auto_merged'
                          ? 'SUCCESS'
                          : m.decision === 'decided_separate'
                          ? 'DANGER'
                          : 'WARN'
                      }
                    >
                      {m.decision ?? 'pending'}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          {lineage.timeline && lineage.timeline.length > 0 && (
            <div className="panel-border rounded-xl p-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-5">
                Event Timeline
              </p>
              <div className="space-y-0">
                {lineage.timeline.map((entry, i) => (
                  <TimelineEntry key={i} entry={entry} index={i} />
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ── Stage detail side panel ──────────────────────────────────────── */}
      <SidePanel
        isOpen={!!panelStage}
        onClose={() => {
          setPanelStage(null);
          setActiveStage(null);
        }}
        title={
          panelStage ? (
            <span className="flex items-center gap-2">
              <span
                className="text-lg"
                style={{ color: STAGE_META[panelStage]?.color ?? 'inherit' }}
              >
                {STAGE_META[panelStage]?.icon ?? '◉'}
              </span>
              {STAGE_META[panelStage]?.label ?? panelStage}
            </span>
          ) : (
            'Stage Detail'
          )
        }
      >
        {panelData ? (
          <div className="space-y-3">
            {Object.entries(panelData).map(([key, val]) => (
              <div key={key} className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                  {key.replace(/_/g, ' ')}
                </span>
                {typeof val === 'object' && val !== null ? (
                  <pre className="text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] rounded-lg p-3 overflow-x-auto border border-[var(--color-border)] whitespace-pre-wrap break-all">
                    {JSON.stringify(val, null, 2)}
                  </pre>
                ) : (
                  <span className="text-sm text-[var(--color-text-primary)] font-mono break-all">
                    {String(val ?? '—')}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <AlertCircle size={28} className="text-[var(--color-text-muted)]" />
            <p className="font-mono text-sm text-[var(--color-text-muted)]">
              No data found for this stage
            </p>
          </div>
        )}
      </SidePanel>
    </div>
  );
}

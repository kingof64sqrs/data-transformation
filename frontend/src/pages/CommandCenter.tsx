import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from 'recharts';
import { motion } from 'framer-motion';
import api from '@/api/client';
import { KpiCard } from '@/components/ui/KpiCard';
import { Skeleton } from '@/components/ui/Skeleton';
import type { SummaryStats, DataQualityReport } from '@/types/api';
import { useLiveFeed } from '@/hooks/useLiveFeed';

// ── Helpers ──────────────────────────────────────────────────────────────────

function useElapsedSeconds(resetKey: number) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [resetKey]);
  return elapsed;
}

// ── KPI definitions ──────────────────────────────────────────────────────────

function buildKpis(s: SummaryStats) {
  return [
    {
      title: 'Source Records',
      value: s.source_records,
      colorClass: 'text-[var(--color-text-secondary)]',
    },
    {
      title: 'Vault Records',
      value: s.vault_records,
      colorClass: 'text-[var(--color-accent-primary)]',
    },
    {
      title: 'Canonical',
      value: s.canonical_records,
      colorClass: 'text-[var(--color-accent-secondary)]',
    },
    {
      title: 'Identity Matches',
      value: s.identity_matches,
      colorClass: 'text-[var(--color-warning)]',
    },
    {
      title: 'Pending Review',
      value: s.review_pending,
      colorClass: 'text-[var(--color-danger)]',
    },
    {
      title: 'Master Records',
      value: s.master_records,
      colorClass: 'text-[var(--color-success)]',
    },
  ];
}

// ── Funnel via BarChart ───────────────────────────────────────────────────────

interface FunnelBarProps {
  data: { stage: string; count: number; fill: string }[];
}

const FunnelBarChart: React.FC<FunnelBarProps> = ({ data }) => (
  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
    <BarChart
      data={data}
      layout="vertical"
      margin={{ top: 4, right: 56, left: 0, bottom: 4 }}
      barCategoryGap="20%"
    >
      <XAxis type="number" hide />
      <YAxis
        dataKey="stage"
        type="category"
        axisLine={false}
        tickLine={false}
        tick={{
          fill: 'var(--color-text-muted)',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
        }}
        width={112}
      />
      <RechartsTooltip
        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
        contentStyle={{
          backgroundColor: 'var(--color-surface-1)',
          borderColor: 'var(--color-border)',
          borderRadius: '6px',
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
        }}
        formatter={(v: number) => [v.toLocaleString(), 'Records']}
      />
      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
        {data.map((entry, i) => (
          <Cell key={i} fill={entry.fill} />
        ))}
        <LabelList
          dataKey="count"
          position="right"
          style={{
            fill: 'var(--color-text-muted)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
          }}
          formatter={(v: number) => v.toLocaleString()}
        />
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

// ── Donut chart ───────────────────────────────────────────────────────────────

interface DonutEntry {
  name: string;
  value: number;
  fill: string;
}

const DONUT_COLORS: Record<string, string> = {
  'Auto Merged': 'var(--color-success)',
  'Manual Review': 'var(--color-warning)',
  Separate: 'var(--color-text-muted)',
};

function buildDonutData(s: SummaryStats): DonutEntry[] {
  return [
    { name: 'Auto Merged', value: s.auto_merged, fill: DONUT_COLORS['Auto Merged'] },
    { name: 'Manual Review', value: s.manual_review, fill: DONUT_COLORS['Manual Review'] },
    { name: 'Separate', value: s.decided_separate, fill: DONUT_COLORS['Separate'] },
  ].filter(d => d.value > 0);
}

// ── Quality score ring ────────────────────────────────────────────────────────

function QualityRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color =
    pct >= 80 ? 'var(--color-success)' : pct >= 60 ? 'var(--color-warning)' : 'var(--color-danger)';

  return (
    <div className="relative flex items-center justify-center" style={{ width: 128, height: 128 }}>
      <svg width={128} height={128} viewBox="0 0 128 128" className="-rotate-90">
        <circle cx={64} cy={64} r={r} fill="none" stroke="var(--color-border)" strokeWidth={10} />
        <circle
          cx={64}
          cy={64}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-mono font-bold text-2xl text-[var(--color-text-primary)]" style={{ color }}>
          {pct}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-text-muted)]">
          Score
        </span>
      </div>
    </div>
  );
}

// ── Custom tooltip for donut ──────────────────────────────────────────────────

const DonutTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0].payload;
  return (
    <div className="panel-border rounded-lg px-3 py-2 text-xs font-mono">
      <span className="text-[var(--color-text-secondary)]">{name}: </span>
      <span className="text-[var(--color-text-primary)] font-bold">{value.toLocaleString()}</span>
    </div>
  );
};

function LiveEventRow({
  type,
  message,
  ts,
}: {
  type: string;
  message: string;
  ts?: string;
}) {
  const stamp = ts ? new Date(ts).toLocaleTimeString([], { hour12: false }) : 'now';
  const label = type.replace(/_/g, ' ').toUpperCase();
  const colorClass =
    type.includes('gold') || type.includes('merge')
      ? 'text-[var(--color-success)]'
      : type.includes('review')
      ? 'text-[var(--color-warning)]'
      : 'text-[var(--color-accent-primary)]';

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[var(--color-border)]/50 last:border-b-0">
      <span className={`font-mono text-[10px] uppercase tracking-widest shrink-0 ${colorClass}`}>
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--color-text-primary)] leading-snug">{message}</p>
        <p className="text-[10px] font-mono text-[var(--color-text-muted)] mt-1">{stamp}</p>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CommandCenter() {
  const { summary, recentEvents, connected } = useLiveFeed();
  const summaryLoading = !summary;
  const lastEventStamp = recentEvents[0]?.timestamp ?? recentEvents[0]?.ts;
  const resetKey = lastEventStamp ? new Date(lastEventStamp).getTime() : 0;
  const elapsed = useElapsedSeconds(resetKey);

  // AI data quality report (fired once on mount)
  const [qualityReport, setQualityReport] = useState<DataQualityReport | null>(null);
  const [qualityLoading, setQualityLoading] = useState(true);
  const [qualityError, setQualityError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    api
      .post<DataQualityReport>('/ai/data-quality-report')
      .then(res => setQualityReport(res.data))
      .catch(err => setQualityError(err?.response?.data?.detail ?? err.message ?? 'Failed'))
      .finally(() => setQualityLoading(false));
  }, []);

  // ── Derived chart data ────────────────────────────────────────────────────

  const funnelData = summary
    ? [
        { stage: 'Source Records', count: summary.source_records, fill: 'var(--color-text-muted)' },
        { stage: 'Raw Vault', count: summary.vault_records, fill: 'var(--color-accent-primary)' },
        { stage: 'Canonical', count: summary.canonical_records, fill: 'var(--color-accent-secondary)' },
        { stage: 'Identity Matches', count: summary.identity_matches, fill: 'var(--color-warning)' },
        { stage: 'Master Records', count: summary.master_records, fill: 'var(--color-success)' },
      ]
    : [];

  const donutData = summary ? buildDonutData(summary) : [];
  const kpis = summary ? buildKpis(summary) : [];

  const totalDecisions = summary
    ? (summary.auto_merged ?? 0) + (summary.manual_review ?? 0) + (summary.decided_separate ?? 0)
    : 0;

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-mono font-bold tracking-tight text-[var(--color-text-primary)]">
            Customer Master Data — Live Intelligence
          </h1>
          <p className="text-xs font-mono text-[var(--color-text-muted)] mt-1">
            End-to-end MDM pipeline visibility &amp; AI-powered data quality
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-text-muted)]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              summaryLoading ? 'bg-[var(--color-warning)] animate-pulse' : connected ? 'bg-[var(--color-success)] animate-pulse' : 'bg-[var(--color-danger)]'
            }`}
          />
          {summaryLoading ? 'Fetching...' : connected ? `Live · ${elapsed}s since last event` : 'Reconnecting...'}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {summaryLoading
          ? Array(6)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="panel-border rounded-lg min-h-[110px] animate-pulse" />
              ))
          : kpis.map((kpi, i) => (
              <motion.div
                key={kpi.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
              >
                <KpiCard {...kpi} />
              </motion.div>
            ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Funnel / Pipeline stage bar */}
        <div className="panel-border rounded-xl p-6 flex flex-col min-h-[320px] min-w-0">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-muted)] mb-4">
            Pipeline Record Funnel
          </h2>
          {summaryLoading ? (
            <div className="flex-1 flex flex-col gap-3 justify-center">
              {Array(5)
                .fill(0)
                .map((_, i) => (
                  <Skeleton key={i} className="h-7 rounded" style={{ width: `${90 - i * 12}%` } as React.CSSProperties} />
                ))}
            </div>
          ) : funnelData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)] font-mono text-sm italic">
              No data available
            </div>
          ) : (
            <div className="flex-1 min-h-[260px] min-w-0">
              <FunnelBarChart data={funnelData} />
            </div>
          )}
        </div>

        {/* Decision split donut */}
        <div className="panel-border rounded-xl p-6 flex flex-col min-h-[320px] min-w-0">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-muted)] mb-4">
            Identity Decision Split
          </h2>
          {summaryLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Skeleton className="w-48 h-48 rounded-full" />
            </div>
          ) : donutData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)] font-mono text-sm italic">
              No decisions recorded yet
            </div>
          ) : (
            <div className="flex-1 flex flex-col md:flex-row items-center gap-6 min-h-[240px] min-w-0">
              <div className="relative w-full flex-1 min-h-[220px] min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      innerRadius="60%"
                      outerRadius="82%"
                      paddingAngle={4}
                      dataKey="value"
                      stroke="transparent"
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                    {summaryLoading ? 'Fetching...' : connected ? `Live · ${elapsed}s since last event` : 'Reconnecting...'}
                  </span>
                  <span className="font-mono font-bold text-4xl text-[var(--color-text-primary)] mt-1" style={{ color: 'var(--color-accent-primary)' }}>
                    {totalDecisions.toLocaleString()}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-text-muted)] mt-0.5">
                    Total
                  </span>
                </div>
              </div>
              {/* Legend */}
              <div className="flex flex-col gap-3 shrink-0">
                {donutData.map(entry => (
                  <div key={entry.name} className="flex items-center gap-2.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: entry.fill }}
                    />
                    <div className="flex flex-col">
                      <span className="font-mono text-xs text-[var(--color-text-primary)]">{entry.name}</span>
                      <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                        {entry.value.toLocaleString()}
                        {totalDecisions > 0 && (
                          <> ({Math.round((entry.value / totalDecisions) * 100)}%)</>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              Live Event Feed
            </h2>
            <p className="text-[11px] font-mono text-[var(--color-text-muted)] mt-1">
              WebSocket events powering the live counters above
            </p>
          </div>
          <span className={`text-[10px] font-mono uppercase tracking-widest ${connected ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
            {connected ? 'Connected' : 'Connecting'}
          </span>
        </div>
        <div className="max-h-[260px] overflow-y-auto pr-2">
          {recentEvents.length === 0 ? (
            <div className="py-8 text-center text-[var(--color-text-muted)] font-mono text-sm">
              Waiting for live updates...
            </div>
          ) : (
            recentEvents.map((event, index) => (
              <LiveEventRow
                key={`${event.type}-${event.timestamp ?? event.ts ?? index}`}
                type={event.type}
                message={event.message}
                ts={event.timestamp ?? event.ts}
              />
            ))
          )}
        </div>
      </div>

      {/* AI Data Quality Panel */}
      <div
        className="panel-border rounded-xl overflow-hidden border-[var(--color-accent-secondary)]/25"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--color-accent-secondary) 8%, transparent) 0%, var(--color-surface-1) 60%)',
        }}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-accent-secondary)]/20">
          <div className="flex items-center gap-3">
            <span className="text-lg text-[var(--color-accent-secondary)] leading-none">✦</span>
            <span className="font-mono text-xs uppercase tracking-widest font-bold text-[var(--color-accent-secondary)]">
              AI Data Quality Report
            </span>
          </div>
          {qualityError && (
            <span className="font-mono text-xs text-[var(--color-danger)]">{qualityError}</span>
          )}
        </div>

        <div className="p-6">
          {qualityLoading && (
            <div className="flex flex-col md:flex-row gap-8">
              <Skeleton className="w-32 h-32 rounded-full shrink-0" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-5/6 rounded" />
                <div className="flex gap-2 mt-4">
                  <Skeleton className="h-8 w-32 rounded-lg" />
                  <Skeleton className="h-8 w-40 rounded-lg" />
                </div>
              </div>
            </div>
          )}

          {!qualityLoading && !qualityReport && !qualityError && (
            <div className="text-center py-8 text-[var(--color-text-muted)] font-mono text-sm italic">
              No quality report available.
            </div>
          )}

          {!qualityLoading && qualityError && (
            <div className="text-center py-8">
              <p className="text-[var(--color-danger)] font-mono text-sm">{qualityError}</p>
              <p className="text-[var(--color-text-muted)] font-mono text-xs mt-2">
                Ensure the AI backend is running and configured.
              </p>
            </div>
          )}

          {!qualityLoading && qualityReport && (
            <div className="flex flex-col md:flex-row gap-8">
              {/* Score ring */}
              <div className="shrink-0 flex flex-col items-center gap-3">
                <QualityRing score={qualityReport.quality_score} />
                <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                  Quality Score
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 space-y-5">
                {/* Summary */}
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {qualityReport.summary}
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Issues */}
                  {qualityReport.issues && qualityReport.issues.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-danger)]">
                        Issues Detected
                      </p>
                      <ul className="space-y-1.5">
                        {qualityReport.issues.map((issue, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
                            <span className="text-[var(--color-danger)] mt-0.5 shrink-0 text-xs">⚠</span>
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recommendations */}
                  {qualityReport.recommendations && qualityReport.recommendations.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-success)]">
                        Recommendations
                      </p>
                      <ul className="space-y-1.5">
                        {qualityReport.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
                            <span className="text-[var(--color-success)] mt-0.5 shrink-0 text-xs">→</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

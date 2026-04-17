import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, List, ChevronRight } from 'lucide-react';
import api from '@/api/client';
import type { MatchRecord, IdentityStats } from '@/types/api';
import { Skeleton } from '@/components/ui/Skeleton';
import { SidePanel } from '@/components/ui/SidePanel';
import { LayerKPIStats } from '@/components/ui/LayerKPIStats';
import SignalBreakdown from '@/components/ui/SignalBreakdown';
import FieldDiff from '@/components/ui/FieldDiff';

const decisionMeta: Record<string, { label: string; color: string; borderColor: string }> = {
  auto_merged: { label: 'Auto-Merged', color: 'var(--color-success)', borderColor: 'border-l-[var(--color-success)]' },
  manual_review: { label: 'In Review', color: 'var(--color-warning)', borderColor: 'border-l-[var(--color-warning)]' },
  decided_separate: { label: 'Separate', color: 'var(--color-text-muted)', borderColor: 'border-l-[var(--color-border)]' },
  pending: { label: 'Pending', color: 'var(--color-accent-primary)', borderColor: 'border-l-[var(--color-accent-primary)]' },
};

const ScoreBar = ({ value, color }: { value: number; color?: string }) => (
  <div className="flex items-center gap-1.5">
    <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color || 'var(--color-accent-primary)' }} />
    </div>
    <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{value.toFixed(0)}%</span>
  </div>
);

export default function IdentityGraph() {
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [activeTab, setActiveTab] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<MatchRecord | null>(null);
  const limit = 50;

  const { data: stats } = useQuery<IdentityStats>({
    queryKey: ['identity-stats'],
    queryFn: () => api.get('/identity/stats').then(r => r.data),
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery<{ matches: MatchRecord[]; total: number }>({
    queryKey: ['identity-graph', activeTab, offset],
    queryFn: () =>
      api.get('/identity/graph', { params: { limit, offset, decision: activeTab } }).then(r => r.data),
  });

  const matches: MatchRecord[] = data?.matches ?? [];
  const total: number = data?.total ?? 0;

  const tabs = [
    { key: '', label: 'All', count: stats?.total_matches },
    { key: 'auto_merged', label: 'Auto-Merged', count: stats?.auto_merged },
    { key: 'manual_review', label: 'In Review', count: stats?.manual_review },
    { key: 'decided_separate', label: 'Separate', count: stats?.decided_separate },
  ];

  const fieldDiffRows = (m: MatchRecord) => [
    { label: 'Full Name', value1: m.record1.full_name, value2: m.record2.full_name, similarity: m.signals.name_score },
    { label: 'Email', value1: m.record1.email, value2: m.record2.email, similarity: m.signals.email_score },
    { label: 'Phone', value1: m.record1.phone_number, value2: m.record2.phone_number, similarity: m.signals.phone_score },
    { label: 'Date of Birth', value1: m.record1.date_of_birth, value2: m.record2.date_of_birth, similarity: m.signals.dob_score },
    { label: 'Address', value1: m.record1.address_line1, value2: m.record2.address_line1 },
    { label: 'City / State', value1: `${m.record1.city}, ${m.record1.state}`, value2: `${m.record2.city}, ${m.record2.state}`, similarity: m.signals.address_score },
  ];

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          Identity Graph — Probabilistic Match Engine
        </h1>
        {stats && (
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-[var(--color-text-secondary)] font-mono">
            <span><strong className="text-[var(--color-text-primary)]">{stats.total_matches.toLocaleString()}</strong> pairs</span>
            <span>Avg confidence <strong className="text-[var(--color-text-primary)]">{stats.avg_confidence.toFixed(1)}%</strong></span>
            <span>Auto-merged <strong className="text-[var(--color-success)]">{stats.auto_merged.toLocaleString()}</strong></span>
            <span>Pending review <strong className="text-[var(--color-warning)]">{stats.manual_review.toLocaleString()}</strong></span>
          </div>
        )}
      </div>

      {/* Layer Quality KPIs */}
      <LayerKPIStats layerName="Identity Graph" layerId={3} />

      {/* Tabs + View Toggle */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)]">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setOffset(0); }}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-[var(--color-accent-primary)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 opacity-70">{tab.count.toLocaleString()}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {([['grid', LayoutGrid], ['table', List]] as const).map(([v, Icon]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`p-2 rounded border transition-colors ${
                view === v
                  ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-primary)]'
              }`}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
      </div>

      {/* Grid View */}
      {view === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="panel-border rounded-lg p-4 border-l-4 border-l-[var(--color-border)]">
                  <Skeleton className="h-4 w-2/3 mb-3 rounded" />
                  <Skeleton className="h-3 w-full mb-1.5 rounded" />
                  <Skeleton className="h-3 w-3/4 rounded" />
                </div>
              ))
            : matches.length === 0
            ? (
                <div className="col-span-3 text-center py-12 text-[var(--color-text-muted)] text-sm">
                  No matches found. Run the pipeline to generate identity matches.
                </div>
              )
            : matches.map(m => {
                const meta = decisionMeta[m.decision] ?? decisionMeta.pending;
                return (
                  <div
                    key={m.match_id}
                    className={`panel-border rounded-lg p-4 border-l-4 cursor-pointer hover:border-[var(--color-accent-primary)]/50 transition-all`}
                    style={{ borderLeftColor: meta.color }}
                    onClick={() => setSelected(m)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-mono text-[var(--color-text-muted)]">MATCH #{m.match_id}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ color: meta.color, backgroundColor: `${meta.color}18` }}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {[m.record1, m.record2].map((r, i) => (
                        <div key={i} className="text-xs space-y-0.5">
                          <div className="font-medium text-[var(--color-text-primary)] truncate">{r.full_name || '—'}</div>
                          <div className="text-[var(--color-text-muted)] truncate">{r.email || '—'}</div>
                          <div className="text-[var(--color-text-muted)]">{[r.city, r.state].filter(Boolean).join(', ') || '—'}</div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1 mb-3">
                      {[
                        ['Email', m.signals.email_score],
                        ['Phone', m.signals.phone_score],
                        ['Name', m.signals.name_score],
                      ].map(([label, val]) => (
                        <div key={label as string} className="flex items-center gap-2">
                          <span className="text-[10px] text-[var(--color-text-muted)] w-10 shrink-0">{label}</span>
                          <ScoreBar value={val as number} />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[var(--color-text-muted)]">Score <span className="text-[var(--color-text-primary)] font-mono font-medium">{m.composite_score.toFixed(1)}%</span></span>
                      <ChevronRight size={14} className="text-[var(--color-text-muted)]" />
                    </div>
                  </div>
                );
              })}
        </div>
      )}

      {/* Table View */}
      {view === 'table' && (
        <div className="panel-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {['Match ID', 'Record A', 'Record B', 'Composite Score', 'AI Conf', 'Decision', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-[var(--color-border)]/50">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full rounded" /></td>
                        ))}
                      </tr>
                    ))
                  : matches.map(m => {
                      const meta = decisionMeta[m.decision] ?? decisionMeta.pending;
                      return (
                        <tr key={m.match_id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface-1)] cursor-pointer" onClick={() => setSelected(m)}>
                          <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">#{m.match_id}</td>
                          <td className="px-4 py-3 text-xs text-[var(--color-text-primary)] max-w-36 truncate">{m.record1.full_name || '—'}</td>
                          <td className="px-4 py-3 text-xs text-[var(--color-text-primary)] max-w-36 truncate">{m.record2.full_name || '—'}</td>
                          <td className="px-4 py-3 w-32"><ScoreBar value={m.composite_score} /></td>
                          <td className="px-4 py-3 text-xs font-mono text-[var(--color-text-secondary)]">{m.ai_confidence.toFixed(1)}%</td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ color: meta.color, backgroundColor: `${meta.color}18` }}>{meta.label}</span>
                          </td>
                          <td className="px-4 py-3"><ChevronRight size={14} className="text-[var(--color-text-muted)]" /></td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <span>Showing {offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="px-3 py-1 rounded border border-[var(--color-border)] disabled:opacity-40 hover:border-[var(--color-accent-primary)] transition-colors">Prev</button>
            <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} className="px-3 py-1 rounded border border-[var(--color-border)] disabled:opacity-40 hover:border-[var(--color-accent-primary)] transition-colors">Next</button>
          </div>
        </div>
      )}

      {/* Side Panel */}
      <SidePanel isOpen={!!selected} onClose={() => setSelected(null)} title={`Match #${selected?.match_id} — Detail`}>
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[var(--color-text-muted)]">COMPOSITE</span>
              <div className="flex-1"><ScoreBar value={selected.composite_score} /></div>
              <span className="font-mono font-semibold text-[var(--color-text-primary)]">{selected.composite_score.toFixed(1)}%</span>
            </div>
            <div>
              <div className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">Field Comparison</div>
              <FieldDiff fields={fieldDiffRows(selected)} />
            </div>
            <div>
              <div className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">Signal Breakdown</div>
              <SignalBreakdown signals={selected.signals} composite_score={selected.composite_score} ai_confidence={selected.ai_confidence} />
            </div>
            {selected.ai_reasoning && (
              <div>
                <div className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">AI Reasoning</div>
                <div className="text-sm text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] rounded-lg p-3 leading-relaxed">
                  {selected.ai_reasoning}
                </div>
              </div>
            )}
          </div>
        )}
      </SidePanel>
    </div>
  );
}

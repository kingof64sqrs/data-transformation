import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Hash, Activity, CircleDot, TrendingUp } from 'lucide-react';
import api from '@/api/client';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { ColumnProfile, RecordsProfileResponse } from '@/types/api';

type Layer = 'bronze' | 'silver' | 'gold';

interface ColumnProfileStripProps {
  layer: Layer;
  title: string;
  description?: string;
}

const profileIcon = (chartType: ColumnProfile['chart_type']) => {
  if (chartType === 'histogram' || chartType === 'trend') return TrendingUp;
  if (chartType === 'bar') return BarChart3;
  if (chartType === 'donut') return CircleDot;
  if (chartType === 'stat') return Hash;
  return Activity;
};

const renderProfileChart = (profile: ColumnProfile) => {
  const chartType = profile.chart_type;
  if (chartType === 'stat' || profile.show_graph === false) {
    return (
      <div className="h-28 flex flex-col justify-center items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/20 px-4 text-center">
        <div className="text-3xl font-bold text-[var(--color-text-primary)]">{profile.distinct_count.toLocaleString()}</div>
        <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">unique values</div>
        <div className="mt-3 flex flex-wrap gap-1 justify-center">
          {profile.examples.slice(0, 3).map((example) => (
            <span key={`${profile.name}-${example}`} className="px-2 py-1 rounded bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] max-w-[120px] truncate">
              {example}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const bars = chartType === 'histogram' || chartType === 'trend' ? profile.distribution : profile.top_values;
  if (!bars || bars.length === 0) {
    return (
      <div className="h-28 flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/20 text-sm text-[var(--color-text-muted)]">
        No distribution available
      </div>
    );
  }

  const maxPct = Math.max(...bars.map((bucket) => bucket.pct), 1);
  return (
    <div className="space-y-2">
      <div className="h-28 flex items-end gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/20 p-3 overflow-hidden">
        {bars.map((bucket) => (
          <HoverTooltip
            key={`${profile.name}-${bucket.label}`}
            content={`${bucket.label}: ${bucket.count.toLocaleString()} records (${bucket.pct}%)`}
            className="flex-1 h-full"
          >
            <div className="w-full h-full min-w-0 flex flex-col items-center justify-end gap-1 cursor-help">
              <div
                className="w-full rounded-t-sm bg-[var(--color-accent-primary)]/85 hover:bg-[var(--color-accent-primary)] transition-colors"
                style={{ height: `${Math.max((bucket.pct / maxPct) * 100, 6)}%` }}
              />
            </div>
          </HoverTooltip>
        ))}
      </div>
      <div className="flex justify-between text-xs text-[var(--color-text-muted)] font-mono">
        <span>{bars[0]?.label || ''}</span>
        <span>{bars[bars.length - 1]?.label || ''}</span>
      </div>
    </div>
  );
};

const ProfileCard: React.FC<{ profile: ColumnProfile }> = ({ profile }) => {
  const Icon = profileIcon(profile.chart_type);
  return (
    <div className="panel-border rounded-xl p-5 w-[320px] shrink-0 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Icon size={14} className="text-[var(--color-accent-primary)] shrink-0" />
            <h3 className="font-mono text-base font-bold text-[var(--color-text-primary)] truncate">{profile.title || profile.label}</h3>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 line-clamp-2">{profile.summary}</p>
        </div>
        <StatusBadge status="INFO" className="shrink-0">{profile.chart_type}</StatusBadge>
      </div>

      {renderProfileChart(profile)}

      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-3 py-2">
          <div className="text-[var(--color-text-muted)] uppercase tracking-widest">Nulls</div>
          <div className="text-[var(--color-text-primary)] mt-1 text-sm">{profile.null_pct}%</div>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-3 py-2">
          <div className="text-[var(--color-text-muted)] uppercase tracking-widest">Distinct</div>
          <div className="text-[var(--color-text-primary)] mt-1 text-sm">{profile.distinct_count}</div>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-3 py-2">
          <div className="text-[var(--color-text-muted)] uppercase tracking-widest">Type</div>
          <div className="text-[var(--color-text-primary)] mt-1 text-sm truncate">{profile.semantic_type}</div>
        </div>
      </div>

      <div className="text-sm text-[var(--color-text-secondary)] font-mono leading-relaxed">{profile.reason}</div>
    </div>
  );
};

export function ColumnProfileStrip({ layer, title, description }: ColumnProfileStripProps) {
  const { data, isLoading } = useQuery<RecordsProfileResponse>({
    queryKey: ['layer-column-profile', layer],
    queryFn: () => api.get<RecordsProfileResponse>(`/records/${layer}/profile?sample_size=300`).then((r) => r.data),
  });

  return (
    <div className="panel-border rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-mono text-sm uppercase tracking-widest text-[var(--color-text-muted)]">{title}</h3>
          {description && <p className="text-[11px] text-[var(--color-text-muted)] mt-1">{description}</p>}
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-text-muted)]">
          <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-[var(--color-warning)] animate-pulse' : 'bg-[var(--color-success)]'}`} />
          {isLoading ? 'Profiling columns...' : `${data?.columns?.length ?? 0} columns profiled`}
          {!isLoading && data && (
            <span className="ml-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-2.5 py-1 uppercase tracking-widest text-[10px]">
              {data.from_cache ? 'cached' : 'fresh build'}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-4 overflow-hidden pb-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="panel-border rounded-xl p-4 w-[280px] shrink-0 space-y-3">
              <div className="h-4 w-32 rounded bg-[var(--color-surface-2)] animate-pulse" />
              <div className="h-24 rounded-lg bg-[var(--color-surface-2)]/40 animate-pulse" />
              <div className="grid grid-cols-3 gap-2">
                <div className="h-12 rounded-lg bg-[var(--color-surface-2)]/30 animate-pulse" />
                <div className="h-12 rounded-lg bg-[var(--color-surface-2)]/30 animate-pulse" />
                <div className="h-12 rounded-lg bg-[var(--color-surface-2)]/30 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {(data?.columns ?? []).map((profile) => (
            <ProfileCard key={profile.name} profile={profile} />
          ))}
        </div>
      )}
    </div>
  );
}
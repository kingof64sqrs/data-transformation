import { useQuery } from '@tanstack/react-query';
import api from '@/api/client';
import { TrendingUp } from 'lucide-react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

interface QualityData {
  overall_score: number;
  grade: string;
  dedup_efficiency_pct: number;
  progression: Array<{
    layer: string;
    layer_id: number;
    records: number;
    confidence_pct: number;
    completeness_pct: number;
    consistency_pct: number;
    description: string;
  }>;
}

interface LayerKPIStatsProps {
  layerName: string;
  layerId: number;
}

export function LayerKPIStats({ layerName, layerId }: LayerKPIStatsProps) {
  const { data, isLoading, error } = useQuery<QualityData>({
    queryKey: ['quality-progression'],
    queryFn: () => api.get('/quality/progression').then(r => r.data),
    staleTime: 30_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="h-24 panel-border rounded-lg animate-pulse"></div>
    );
  }

  if (error || !data?.progression) {
    return null;
  }

  const layer = data.progression.find(l => l.layer_id === layerId);
  if (!layer) {
    return null;
  }

  const getMetricColor = (value: number): string => {
    if (value >= 90) return 'text-[var(--color-success)]';
    if (value >= 70) return 'text-[var(--color-warning)]';
    return 'text-[var(--color-danger)]';
  };

  const getMetricBar = (value: number): string => {
    if (value >= 90) return 'var(--color-success)';
    if (value >= 70) return 'var(--color-warning)';
    return 'var(--color-danger)';
  };

  return (
    <div className="panel-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-[var(--color-accent-primary)]" />
        <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">{layerName} Quality Metrics</p>
      </div>
      
      <div className="grid grid-cols-4 gap-3">
        {/* Records */}
        <div className="space-y-1">
          <HoverTooltip content="Total rows currently present at this layer." className="block">
            <p className="text-xs text-[var(--color-text-secondary)] font-medium">Records</p>
          </HoverTooltip>
          <HoverTooltip content={`${layer.records.toLocaleString()} records available in this layer.`} className="block">
            <p className="text-lg font-bold text-[var(--color-accent-primary)]">{layer.records.toLocaleString()}</p>
          </HoverTooltip>
          <p className="text-xs text-[var(--color-text-muted)]">{layer.description}</p>
        </div>

        {/* Confidence % */}
        <div className="space-y-1">
          <HoverTooltip content="Model confidence at this layer. Higher means stronger certainty in generated/matched outputs." className="block">
            <p className="text-xs text-[var(--color-text-secondary)] font-medium">Confidence %</p>
          </HoverTooltip>
          {layer.confidence_pct === 0 ? (
            <HoverTooltip content="Confidence is not applicable for this layer." className="block">
              <p className="text-lg font-bold text-[var(--color-text-muted)]">N/A</p>
            </HoverTooltip>
          ) : (
            <HoverTooltip content={`Confidence ${layer.confidence_pct.toFixed(1)}%. Thresholds: >=90 strong, 70-89 moderate, <70 weak.`} className="block">
              <p className={`text-lg font-bold ${getMetricColor(layer.confidence_pct)}`}>
                {layer.confidence_pct.toFixed(1)}%
              </p>
            </HoverTooltip>
          )}
          <HoverTooltip content={`Confidence progress bar at ${Math.min(layer.confidence_pct, 100).toFixed(1)}%.`} className="block w-full">
            <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden w-full">
              <div
                className="h-full transition-all"
                style={{ width: `${Math.min(layer.confidence_pct, 100)}%`, backgroundColor: getMetricBar(layer.confidence_pct) }}
              />
            </div>
          </HoverTooltip>
        </div>

        {/* Completeness % */}
        <div className="space-y-1">
          <HoverTooltip content="Data completeness at this layer: percentage of required fields populated." className="block">
            <p className="text-xs text-[var(--color-text-secondary)] font-medium">Completeness %</p>
          </HoverTooltip>
          <HoverTooltip content={`Completeness ${layer.completeness_pct.toFixed(1)}%. Indicates field coverage depth.`} className="block">
            <p className={`text-lg font-bold ${getMetricColor(layer.completeness_pct)}`}>
              {layer.completeness_pct.toFixed(1)}%
            </p>
          </HoverTooltip>
          <HoverTooltip content={`Completeness progress bar at ${Math.min(layer.completeness_pct, 100).toFixed(1)}%.`} className="block w-full">
            <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden w-full">
              <div
                className="h-full transition-all"
                style={{ width: `${Math.min(layer.completeness_pct, 100)}%`, backgroundColor: getMetricBar(layer.completeness_pct) }}
              />
            </div>
          </HoverTooltip>
        </div>

        {/* Consistency % */}
        <div className="space-y-1">
          <HoverTooltip content="Cross-field consistency score: checks whether related attributes agree logically." className="block">
            <p className="text-xs text-[var(--color-text-secondary)] font-medium">Consistency %</p>
          </HoverTooltip>
          <HoverTooltip content={`Consistency ${layer.consistency_pct.toFixed(1)}%. Higher means fewer conflicting field combinations.`} className="block">
            <p className={`text-lg font-bold ${getMetricColor(layer.consistency_pct)}`}>
              {layer.consistency_pct.toFixed(1)}%
            </p>
          </HoverTooltip>
          <HoverTooltip content={`Consistency progress bar at ${Math.min(layer.consistency_pct, 100).toFixed(1)}%.`} className="block w-full">
            <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden w-full">
              <div
                className="h-full transition-all"
                style={{ width: `${Math.min(layer.consistency_pct, 100)}%`, backgroundColor: getMetricBar(layer.consistency_pct) }}
              />
            </div>
          </HoverTooltip>
        </div>
      </div>
    </div>
  );
}

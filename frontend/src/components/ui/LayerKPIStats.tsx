import { useQuery } from '@tanstack/react-query';
import api from '@/api/client';
import { TrendingUp } from 'lucide-react';

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
      <div className="h-24 bg-gray-100 rounded-lg animate-pulse"></div>
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
    if (value >= 90) return 'text-green-600';
    if (value >= 70) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-blue-600" />
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{layerName} Quality Metrics</p>
      </div>
      
      <div className="grid grid-cols-4 gap-3">
        {/* Records */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">Records</p>
          <p className="text-lg font-bold text-blue-600">{layer.records.toLocaleString()}</p>
          <p className="text-xs text-gray-400">{layer.description}</p>
        </div>

        {/* Confidence % */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">Confidence %</p>
          {layer.confidence_pct === 0 ? (
            <p className="text-lg font-bold text-gray-400">N/A</p>
          ) : (
            <p className={`text-lg font-bold ${getMetricColor(layer.confidence_pct)}`}>
              {layer.confidence_pct.toFixed(1)}%
            </p>
          )}
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${layer.confidence_pct >= 90 ? 'bg-green-500' : layer.confidence_pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(layer.confidence_pct, 100)}%` }}
            />
          </div>
        </div>

        {/* Completeness % */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">Completeness %</p>
          <p className={`text-lg font-bold ${getMetricColor(layer.completeness_pct)}`}>
            {layer.completeness_pct.toFixed(1)}%
          </p>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${layer.completeness_pct >= 90 ? 'bg-green-500' : layer.completeness_pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(layer.completeness_pct, 100)}%` }}
            />
          </div>
        </div>

        {/* Consistency % */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">Consistency %</p>
          <p className={`text-lg font-bold ${getMetricColor(layer.consistency_pct)}`}>
            {layer.consistency_pct.toFixed(1)}%
          </p>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${layer.consistency_pct >= 90 ? 'bg-green-500' : layer.consistency_pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(layer.consistency_pct, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

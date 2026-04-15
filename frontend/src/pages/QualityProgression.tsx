import { useEffect, useState } from 'react';
import api from '../api/client';
import { TrendingUp, AlertCircle } from 'lucide-react';

interface Layer {
  layer: string;
  layer_id: number;
  records: number;
  confidence_pct: number;
  completeness_pct: number;
  consistency_pct: number;
  description: string;
}

interface QualityData {
  overall_score: number;
  grade: string;
  dedup_efficiency_pct: number;
  progression: Layer[];
}

export function QualityProgression() {
  const [data, setData] = useState<QualityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const fetchProgression = async () => {
      try {
        setLoading(true);
        const response = await api.get('/quality/progression');
        setData(response.data);
        setError(null);
      } catch (err) {
        setError((err as Error).message || 'Failed to load quality progression');
        console.error('Quality progression error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProgression();
    
    if (autoRefresh) {
      const interval = setInterval(fetchProgression, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getMetricColor = (value: number, metric: 'records' | 'confidence' | 'completeness' | 'consistency'): string => {
    if (metric === 'records') return 'text-blue-600 font-bold';
    if (metric === 'confidence' || metric === 'completeness' || metric === 'consistency') {
      if (value >= 90) return 'text-green-600 font-semibold';
      if (value >= 70) return 'text-amber-600 font-semibold';
      return 'text-red-600 font-semibold';
    }
    return 'text-gray-700';
  };

  const getProgressBar = (value: number): JSX.Element => {
    const width = Math.min(value, 100);
    const color = value >= 90 ? 'bg-green-500' : value >= 70 ? 'bg-amber-500' : 'bg-red-500';
    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full ${color} transition-all duration-300`}
            style={{ width: `${width}%` }}
          />
        </div>
        <span className="text-xs font-mono text-gray-700 min-w-10 text-right">{value.toFixed(1)}%</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Loading quality metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex gap-3 items-start">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-red-900">Error Loading Metrics</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Quality Progression</h1>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded"
          />
          <span className="text-sm text-gray-700">Auto-refresh (10s)</span>
        </label>
      </div>

      <p className="text-sm text-gray-600">
        Monitor how data quality metrics improve as records flow through each layer of the pipeline
      </p>

      {/* Overall Quality Score Card */}
      {data && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200 p-8 shadow-lg">
          <div className="grid grid-cols-3 gap-8">
            {/* Overall Score */}
            <div className="flex flex-col items-center justify-center">
              <p className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wider">Overall Quality Score</p>
              <div className="relative w-32 h-32 flex items-center justify-center mb-4">
                <svg className="transform -rotate-90" width="128" height="128">
                  <circle
                    cx="64"
                    cy="64"
                    r="60"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="8"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="60"
                    fill="none"
                    stroke={data.overall_score >= 90 ? '#10b981' : data.overall_score >= 80 ? '#f59e0b' : data.overall_score >= 70 ? '#ef4444' : '#6b7280'}
                    strokeWidth="8"
                    strokeDasharray={`${(data.overall_score / 100) * 377} 377`}
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute text-center">
                  <div className="text-4xl font-bold text-gray-900">{data.overall_score.toFixed(1)}</div>
                  <div className="text-sm text-gray-600">/ 100</div>
                </div>
              </div>
              <div className="text-center">
                <span className={`inline-block px-4 py-2 rounded-full font-bold text-lg ${
                  data.grade === 'A' ? 'bg-green-100 text-green-700' :
                  data.grade === 'B' ? 'bg-blue-100 text-blue-700' :
                  data.grade === 'C' ? 'bg-yellow-100 text-yellow-700' :
                  data.grade === 'D' ? 'bg-orange-100 text-orange-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  Grade: {data.grade}
                </span>
              </div>
            </div>

            {/* Deduplication Efficiency */}
            <div className="flex flex-col items-center justify-center space-y-4">
              <p className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wider">Deduplication Efficiency</p>
              <div className="text-5xl font-bold text-blue-600">{data.dedup_efficiency_pct.toFixed(1)}%</div>
              <div className="text-sm text-gray-700 text-center">
                <p className="font-semibold">{data.progression[0]?.records} → {data.progression[3]?.records} records</p>
                <p className="text-gray-500">Data consolidated</p>
              </div>
            </div>

            {/* Quality Metrics Summary */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wider">Master Records Quality</p>
              <div className="space-y-2">
                {data.progression[3] && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">Confidence</span>
                      <span className="font-bold text-lg">{data.progression[3].confidence_pct.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">Completeness</span>
                      <span className="font-bold text-lg">{data.progression[3].completeness_pct.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">Consistency</span>
                      <span className="font-bold text-lg">{data.progression[3].consistency_pct.toFixed(1)}%</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rest of the component continues... */}

      {/* Main Table */}
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            {/* Header */}
            <thead className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
              <tr>
                <th className="px-6 py-4 text-left font-semibold">Layer</th>
                <th className="px-6 py-4 text-right font-semibold">Record Count</th>
                <th className="px-6 py-4 text-center font-semibold">Avg Confidence %</th>
                <th className="px-6 py-4 text-center font-semibold">Completeness %</th>
                <th className="px-6 py-4 text-center font-semibold">Consistency %</th>
              </tr>
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-gray-100">
              {data?.progression.map((layer) => (
                <tr key={layer.layer_id} className="hover:bg-blue-50 transition-colors">
                  {/* Layer Name */}
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-semibold text-sm">
                        {layer.layer_id}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{layer.layer}</p>
                        <p className="text-xs text-gray-500">{layer.description}</p>
                      </div>
                    </div>
                  </td>

                  {/* Record Count */}
                  <td className="px-6 py-5 text-right">
                    <span className={`${getMetricColor(layer.records, 'records')} text-lg`}>
                      {layer.records.toLocaleString()}
                    </span>
                  </td>

                  {/* Confidence % */}
                  <td className="px-6 py-5">
                    <div className="flex items-center justify-center">
                      {layer.confidence_pct === 0 ? (
                        <span className="text-xs text-gray-400">N/A</span>
                      ) : (
                        <span className={getMetricColor(layer.confidence_pct, 'confidence')}>
                          {layer.confidence_pct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Completeness % */}
                  <td className="px-6 py-5">
                    <div className="w-full max-w-xs mx-auto">
                      {getProgressBar(layer.completeness_pct)}
                    </div>
                  </td>

                  {/* Consistency % */}
                  <td className="px-6 py-5">
                    <div className="w-full max-w-xs mx-auto">
                      {getProgressBar(layer.consistency_pct)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        {data?.progression.map((layer) => (
          <div key={layer.layer_id} className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <p className="text-xs text-gray-500 uppercase font-semibold mb-2">{layer.layer}</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Records:</span>
                <span className="font-bold text-blue-600">{layer.records.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Complete:</span>
                <span className="font-semibold">{layer.completeness_pct.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Consistent:</span>
                <span className="font-semibold">{layer.consistency_pct.toFixed(1)}%</span>
              </div>
              {layer.confidence_pct > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Confidence:</span>
                  <span className="font-semibold">{layer.confidence_pct.toFixed(1)}%</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Metric Definitions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div>
            <p><strong>Completeness %:</strong> Average % of critical fields (name, email, phone) populated</p>
          </div>
          <div>
            <p><strong>Consistency %:</strong> Records with valid email OR phone format</p>
          </div>
          <div>
            <p><strong>Avg Confidence %:</strong> Average confidence score of approved duplicate matches</p>
          </div>
          <div>
            <p><strong>Record Count:</strong> Total records in each layer (canonical = distinct profiles)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

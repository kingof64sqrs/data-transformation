import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Archive,
  GitMerge,
  Network,
  Cpu,
  Star,
  ChevronRight,
  RotateCcw,
  Play,
  Layers,
} from 'lucide-react';
import api from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useSSE } from '@/hooks/useSSE';
import type { PipelineEvent, PipelineRunResult, StageResult } from '@/types/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type StageId = 'ingest' | 'vault' | 'canonical' | 'identity' | 'decision' | 'master';
type StageStatus = 'idle' | 'running' | 'complete' | 'error';

interface StageState {
  id: StageId;
  label: string;
  icon: React.ReactNode;
  status: StageStatus;
  records?: number;
}

interface LogLine {
  ts: string;
  type: PipelineEvent['type'];
  message: string;
}

interface PipelineHistoryEntry {
  run_id: string;
  status: string;
  duration_ms: number;
  created_at?: string;
  stages?: StageResult[];
}

// ── Stage definitions ─────────────────────────────────────────────────────────

const INITIAL_STAGES: StageState[] = [
  { id: 'ingest', label: 'Ingestion', icon: <Database size={18} />, status: 'idle' },
  { id: 'vault', label: 'Raw Vault', icon: <Archive size={18} />, status: 'idle' },
  { id: 'canonical', label: 'Canonical', icon: <Layers size={18} />, status: 'idle' },
  { id: 'identity', label: 'Identity Graph', icon: <Network size={18} />, status: 'idle' },
  { id: 'decision', label: 'Decision Engine', icon: <Cpu size={18} />, status: 'idle' },
  { id: 'master', label: 'Master Records', icon: <Star size={18} />, status: 'idle' },
];

// ── Stage box ─────────────────────────────────────────────────────────────────

const stageStatusBorder: Record<StageStatus, string> = {
  idle: 'border-[var(--color-border)]',
  running: 'border-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.4)]',
  complete: 'border-[var(--color-success)] shadow-[0_0_12px_rgba(52,211,153,0.3)]',
  error: 'border-[var(--color-danger)] shadow-[0_0_12px_rgba(251,113,133,0.3)]',
};

const stageStatusText: Record<StageStatus, string> = {
  idle: 'text-[var(--color-text-muted)]',
  running: 'text-cyan-400',
  complete: 'text-[var(--color-success)]',
  error: 'text-[var(--color-danger)]',
};

const StageBox: React.FC<{ stage: StageState }> = ({ stage }) => {
  const isRunning = stage.status === 'running';

  return (
    <motion.div
      layout
      className={`relative flex flex-col items-center gap-2 px-3 py-4 rounded-xl border-2 min-w-[96px] transition-all duration-300 bg-[var(--color-surface-1)] ${stageStatusBorder[stage.status]}`}
    >
      {isRunning && (
        <span className="absolute inset-0 rounded-xl border-2 border-cyan-400 animate-ping opacity-40 pointer-events-none" />
      )}
      <span className={`${stageStatusText[stage.status]} transition-colors`}>
        {stage.icon}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-center text-[var(--color-text-primary)] leading-tight">
        {stage.label}
      </span>
      <div className="flex flex-col items-center gap-0.5">
        <span
          className={`font-mono text-[9px] uppercase tracking-widest font-bold ${stageStatusText[stage.status]}`}
        >
          {stage.status}
        </span>
        {stage.records !== undefined && (
          <span className="font-mono text-[9px] text-[var(--color-text-muted)]">
            {stage.records.toLocaleString()} rec
          </span>
        )}
      </div>
    </motion.div>
  );
};

// ── Log terminal ──────────────────────────────────────────────────────────────

function logColor(type: PipelineEvent['type']): string {
  switch (type) {
    case 'stage_complete':
      return 'text-[var(--color-success)]';
    case 'stage_start':
    case 'log':
      return 'text-[var(--color-warning)]';
    case 'error':
      return 'text-[var(--color-danger)]';
    case 'pipeline_complete':
      return 'text-[var(--color-accent-primary)]';
    default:
      return 'text-[var(--color-text-muted)]';
  }
}

function logPrefix(type: PipelineEvent['type']): string {
  switch (type) {
    case 'stage_complete':
      return '[DONE]  ';
    case 'stage_start':
      return '[START] ';
    case 'error':
      return '[ERROR] ';
    case 'pipeline_complete':
      return '[PIPELINE]';
    default:
      return '[LOG]   ';
  }
}

const MAX_LOG_LINES = 200;

// ── Stats table ───────────────────────────────────────────────────────────────

const StatsTable: React.FC<{ stages: StageResult[] }> = ({ stages }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="border-b border-[var(--color-border)]">
          {['Stage', 'Records In', 'Records Out', 'Duration', 'Status'].map(h => (
            <th
              key={h}
              className="py-2 px-3 font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {stages.map((s, i) => (
          <tr key={i} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface-2)]/30 transition-colors">
            <td className="py-2 px-3 font-mono text-xs text-[var(--color-text-primary)] capitalize">
              {s.stage}
            </td>
            <td className="py-2 px-3 font-mono text-xs text-[var(--color-text-secondary)] tabular-nums">
              {s.records_in?.toLocaleString() ?? '—'}
            </td>
            <td className="py-2 px-3 font-mono text-xs text-[var(--color-text-secondary)] tabular-nums">
              {s.records_out?.toLocaleString() ?? '—'}
            </td>
            <td className="py-2 px-3 font-mono text-xs text-[var(--color-text-secondary)] tabular-nums">
              {s.duration_ms !== undefined ? `${(s.duration_ms / 1000).toFixed(2)}s` : '—'}
            </td>
            <td className="py-2 px-3">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider ${
                  s.status === 'completed'
                    ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30'
                    : s.status === 'failed'
                    ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30'
                    : 'bg-[var(--color-text-muted)]/10 text-[var(--color-text-muted)] border border-[var(--color-border)]'
                }`}
              >
                {s.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ── History list ──────────────────────────────────────────────────────────────

const HistoryList: React.FC<{ runs: PipelineHistoryEntry[] }> = ({ runs }) => {
  if (!runs.length) {
    return (
      <p className="text-center py-6 font-mono text-sm italic text-[var(--color-text-muted)]">
        No pipeline runs recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map(run => (
        <div
          key={run.run_id}
          className="flex items-center justify-between px-4 py-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/30 hover:bg-[var(--color-surface-2)]/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span
              className={`w-2 h-2 rounded-full ${
                run.status === 'completed'
                  ? 'bg-[var(--color-success)]'
                  : run.status === 'failed'
                  ? 'bg-[var(--color-danger)]'
                  : 'bg-[var(--color-warning)]'
              }`}
            />
            <div className="flex flex-col">
              <span className="font-mono text-xs text-[var(--color-text-primary)]">{run.run_id}</span>
              {run.created_at && (
                <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  {new Date(run.created_at).toLocaleString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-[var(--color-text-muted)] tabular-nums">
              {run.duration_ms !== undefined ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—'}
            </span>
            <span
              className={`font-mono text-[10px] font-bold uppercase ${
                run.status === 'completed'
                  ? 'text-[var(--color-success)]'
                  : run.status === 'failed'
                  ? 'text-[var(--color-danger)]'
                  : 'text-[var(--color-warning)]'
              }`}
            >
              {run.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────

const STAGE_IDS: StageId[] = ['ingest', 'vault', 'canonical', 'identity', 'decision', 'master'];

export default function PipelineOrchestration() {
  // Config state
  const [resetAll, setResetAll] = useState(false);
  const [skipKafka, setSkipKafka] = useState(false);
  const [recordLimit, setRecordLimit] = useState<string>('');
  const [enabledStages, setEnabledStages] = useState<Record<StageId, boolean>>(
    Object.fromEntries(STAGE_IDS.map(id => [id, true])) as Record<StageId, boolean>
  );

  // Pipeline run state
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<PipelineRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [stages, setStages] = useState<StageState[]>(INITIAL_STAGES);

  // Logs
  const [logs, setLogs] = useState<LogLine[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // SSE
  useSSE(isRunning, useCallback((event: PipelineEvent) => {
    if (event.type === 'heartbeat') return;

    setLogs(prev => {
      const next = [
        ...prev,
        { ts: event.ts ?? new Date().toISOString(), type: event.type, message: event.message },
      ];
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
    });

    // Update stage statuses from events
    if (event.type === 'stage_start') {
      const stageName = (event.data?.stage as string | undefined)?.toLowerCase();
      setStages(prev =>
        prev.map(s =>
          stageName && s.id === stageName ? { ...s, status: 'running' } : s
        )
      );
    }
    if (event.type === 'stage_complete') {
      const stageName = (event.data?.stage as string | undefined)?.toLowerCase();
      const records = event.data?.records_out as number | undefined;
      setStages(prev =>
        prev.map(s =>
          stageName && s.id === stageName
            ? { ...s, status: 'complete', records }
            : s
        )
      );
    }
    if (event.type === 'error') {
      const stageName = (event.data?.stage as string | undefined)?.toLowerCase();
      setStages(prev =>
        prev.map(s =>
          stageName && s.id === stageName ? { ...s, status: 'error' } : s
        )
      );
    }
    if (event.type === 'pipeline_complete') {
      setIsRunning(false);
    }
  }, []));

  // Auto-scroll log
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Pipeline history
  const {
    data: historyData,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = useQuery<PipelineHistoryEntry[]>({
    queryKey: ['pipeline-history'],
    queryFn: async () => {
      const res = await api.get('/pipeline/history');
      return res.data;
    },
    refetchOnWindowFocus: false,
  });

  // Toggle stage
  function toggleStage(id: StageId) {
    setEnabledStages(prev => ({ ...prev, [id]: !prev[id] }));
  }

  // Run pipeline
  async function runPipeline() {
    setIsRunning(true);
    setRunResult(null);
    setRunError(null);
    setStages(INITIAL_STAGES);
    setLogs([]);

    try {
      const payload: Record<string, unknown> = {
        reset_layers: resetAll,
        skip_kafka: skipKafka,
        stages: STAGE_IDS.filter(id => enabledStages[id]),
      };
      if (recordLimit !== '') {
        payload.record_limit = parseInt(recordLimit, 10);
      }

      const res = await api.post<PipelineRunResult>('/pipeline/run', payload, { timeout: 300_000 });
      setRunResult(res.data);

      // Apply final stage statuses from result
      if (res.data.stages?.length) {
        setStages(prev =>
          prev.map(s => {
            const found = res.data.stages.find(
              rs => rs.stage.toLowerCase() === s.id
            );
            if (!found) return s;
            return {
              ...s,
              status: found.status === 'completed' ? 'complete' : found.status === 'failed' ? 'error' : 'idle',
              records: found.records_out,
            };
          })
        );
      }

      refetchHistory();
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? err?.message ?? 'Pipeline failed';
      setRunError(msg);
      setStages(prev =>
        prev.map(s => (s.status === 'running' ? { ...s, status: 'error' } : s))
      );
    } finally {
      setIsRunning(false);
    }
  }

  // Rebuild master
  async function rebuildMaster() {
    setRunError(null);
    try {
      await api.post('/pipeline/rebuild-master', {}, { timeout: 120_000 });
      refetchHistory();
      setLogs(prev => [
        ...prev,
        {
          ts: new Date().toISOString(),
          type: 'stage_complete',
          message: 'Master records rebuilt successfully.',
        },
      ]);
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? err?.message ?? 'Rebuild failed';
      setRunError(msg);
    }
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-mono font-bold tracking-tight text-[var(--color-text-primary)]">
          Pipeline Orchestration
        </h1>
        <p className="text-xs font-mono text-[var(--color-text-muted)] mt-1">
          Configure, run and monitor the MDM data pipeline in real time
        </p>
      </div>

      {/* Control panel */}
      <div className="panel-border rounded-xl p-6 space-y-6">
        <h2 className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
          Configuration
        </h2>

        <div className="flex flex-wrap gap-8">
          {/* Checkboxes */}
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative w-10 h-6 shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={resetAll}
                  onChange={e => setResetAll(e.target.checked)}
                  disabled={isRunning}
                />
                <div className="w-10 h-6 bg-[var(--color-surface-2)] rounded-full border border-[var(--color-border)] peer-checked:bg-[var(--color-warning)] transition-colors" />
                <div className="absolute top-[3px] left-[3px] w-4.5 h-4.5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4 w-[18px] h-[18px]" />
              </div>
              <div>
                <span className="font-mono text-sm text-[var(--color-text-primary)]">Reset All Layers</span>
                <p className="text-[10px] font-mono text-[var(--color-text-muted)] mt-0.5">
                  Wipes processed data and re-runs from source
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative w-10 h-6 shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={skipKafka}
                  onChange={e => setSkipKafka(e.target.checked)}
                  disabled={isRunning}
                />
                <div className="w-10 h-6 bg-[var(--color-surface-2)] rounded-full border border-[var(--color-border)] peer-checked:bg-[var(--color-accent-secondary)] transition-colors" />
                <div className="absolute top-[3px] left-[3px] w-[18px] h-[18px] bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <div>
                <span className="font-mono text-sm text-[var(--color-text-primary)]">Skip Kafka</span>
                <p className="text-[10px] font-mono text-[var(--color-text-muted)] mt-0.5">
                  Read directly from DB instead of Kafka
                </p>
              </div>
            </label>
          </div>

          {/* Record limit */}
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              Record Limit
            </label>
            <input
              type="number"
              min={1}
              value={recordLimit}
              onChange={e => setRecordLimit(e.target.value)}
              placeholder="All records"
              disabled={isRunning}
              className="w-40 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm font-code text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-primary)] disabled:opacity-50 transition-colors"
            />
          </div>

          {/* Stage toggles */}
          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              Stages
            </p>
            <div className="flex flex-wrap gap-2">
              {STAGE_IDS.map(id => (
                <button
                  key={id}
                  onClick={() => toggleStage(id)}
                  disabled={isRunning}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all border ${
                    enabledStages[id]
                      ? 'bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)] border-[var(--color-accent-primary)]/40 hover:border-[var(--color-accent-primary)]'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 pt-2 border-t border-[var(--color-border)]">
          <Button
            variant="primary"
            size="lg"
            onClick={runPipeline}
            disabled={isRunning}
            className="flex items-center gap-2 font-mono uppercase tracking-wider"
          >
            {isRunning ? (
              <>
                <span className="animate-spin text-base">◎</span>
                Running...
              </>
            ) : (
              <>
                <Play size={16} />
                Run Pipeline
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            size="lg"
            onClick={rebuildMaster}
            disabled={isRunning}
            className="flex items-center gap-2 font-mono uppercase tracking-wider"
          >
            <RotateCcw size={16} />
            Rebuild Master
          </Button>
        </div>

        {runError && (
          <p className="text-sm font-mono text-[var(--color-danger)] bg-[var(--color-danger)]/5 border border-[var(--color-danger)]/30 rounded-lg px-3 py-2">
            {runError}
          </p>
        )}
      </div>

      {/* Pipeline Stage Diagram */}
      <div className="panel-border rounded-xl p-6">
        <h2 className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-muted)] mb-6">
          Pipeline Stages
        </h2>
        <div className="flex items-center justify-start gap-1 overflow-x-auto pb-2">
          {stages.map((stage, i) => (
            <React.Fragment key={stage.id}>
              <StageBox stage={stage} />
              {i < stages.length - 1 && (
                <div className="flex items-center shrink-0 px-1">
                  <motion.div
                    animate={
                      stage.status === 'complete'
                        ? { opacity: [0.4, 1, 0.4], x: [0, 4, 0] }
                        : { opacity: 0.3 }
                    }
                    transition={{ repeat: Infinity, duration: 1.2 }}
                  >
                    <ChevronRight
                      size={20}
                      className={
                        stage.status === 'complete'
                          ? 'text-[var(--color-success)]'
                          : stage.status === 'running'
                          ? 'text-cyan-400'
                          : 'text-[var(--color-border)]'
                      }
                    />
                  </motion.div>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Live Log Terminal */}
      <div className="panel-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] bg-[#05080f]/60">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2 h-2 rounded-full ${isRunning ? 'bg-cyan-400 animate-pulse' : logs.length ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-muted)]'}`}
            />
            <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              Live Log Terminal
            </span>
          </div>
          <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
            {logs.length} lines
          </span>
        </div>
        <div
          ref={logContainerRef}
          className="bg-[#05080f] font-code text-sm overflow-y-auto p-4 h-72 relative"
          style={{ scrollBehavior: 'smooth' }}
        >
          {/* Scanline overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] z-0" />
          <div className="relative z-10 flex flex-col gap-1">
            {logs.length === 0 && (
              <span className="text-[var(--color-text-muted)] italic">
                {isRunning ? 'Waiting for pipeline events...' : 'Run the pipeline to see live logs.'}
              </span>
            )}
            {logs.map((line, i) => (
              <div
                key={i}
                className="flex gap-3 hover:bg-white/[0.02] -mx-2 px-2 py-0.5 rounded transition-colors"
              >
                <span className="text-[var(--color-text-muted)] shrink-0 text-[11px]">
                  [{new Date(line.ts).toLocaleTimeString()}]
                </span>
                <span className={`shrink-0 w-[80px] font-bold text-[11px] ${logColor(line.type)}`}>
                  {logPrefix(line.type)}
                </span>
                <span className="text-[var(--color-text-primary)] text-[11px] break-all">{line.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Results stats table */}
      <AnimatePresence>
        {runResult && runResult.stages && runResult.stages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="panel-border rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
                Run Results
              </h2>
              <div className="flex items-center gap-3">
                <span
                  className={`font-mono text-xs font-bold uppercase ${
                    runResult.status === 'completed'
                      ? 'text-[var(--color-success)]'
                      : 'text-[var(--color-danger)]'
                  }`}
                >
                  {runResult.status}
                </span>
                {runResult.duration_ms && (
                  <span className="font-mono text-xs text-[var(--color-text-muted)]">
                    {(runResult.duration_ms / 1000).toFixed(1)}s total
                  </span>
                )}
              </div>
            </div>
            <StatsTable stages={runResult.stages} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pipeline history */}
      <div className="panel-border rounded-xl p-6">
        <h2 className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-muted)] mb-4">
          Pipeline History
        </h2>
        {historyLoading ? (
          <div className="space-y-2">
            {Array(3)
              .fill(0)
              .map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
          </div>
        ) : (
          <HistoryList runs={historyData ?? []} />
        )}
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  Sun,
  Moon,
  CheckCircle2,
  XCircle,
  Activity,
  Database,
  Cpu,
  Sliders,
  Key,
  Clock,
} from 'lucide-react';
import api from '@/api/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'error' | string;
  ai_configured: boolean;
  timestamp: string;
  version?: string;
  db_path?: string;
  kafka_broker?: string;
  kafka_topic?: string;
  auto_merge_threshold?: number;
  manual_review_threshold?: number;
  azure_openai_endpoint?: string;
  azure_openai_model?: string;
  azure_openai_key_configured?: boolean;
  uptime_seconds?: number;
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function SectionCard({
  title,
  icon,
  children,
  delay = 0,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="panel-border rounded-xl overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <span className="text-[var(--color-accent-secondary)]">{icon}</span>
        <h2 className="font-mono text-xs uppercase tracking-widest font-bold text-[var(--color-text-primary)]">
          {title}
        </h2>
      </div>
      <div className="p-5 space-y-4 bg-[var(--color-surface-1)]">{children}</div>
    </motion.div>
  );
}

// ─── Info row ────────────────────────────────────────────────────────────────
function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[var(--color-border)]/50 last:border-b-0">
      <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] shrink-0 pt-0.5">
        {label}
      </span>
      <span
        className={cn(
          'text-sm text-[var(--color-text-primary)] text-right break-all leading-relaxed',
          mono && 'font-mono text-xs text-[var(--color-text-secondary)]'
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Threshold card ───────────────────────────────────────────────────────────
function ThresholdCard({
  label,
  value,
  description,
  color,
}: {
  label: string;
  value: number;
  description: string;
  color: string;
}) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="panel-border rounded-xl p-4 bg-[var(--color-surface-2)] space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest font-bold" style={{ color }}>
          {label}
        </p>
        <span className="font-mono font-bold text-2xl tabular-nums" style={{ color }}>
          {Math.round(pct * 100)}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct * 100}%`,
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}60`,
          }}
        />
      </div>
      <p className="text-xs text-[var(--color-text-muted)] font-mono leading-relaxed">
        {description}
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Settings() {
  const { toast } = useToast();

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(false);
    try {
      const res = await api.get<HealthResponse>('/health');
      setHealth(res.data);
    } catch {
      setHealthError(true);
      toast('Failed to reach API', 'error');
    } finally {
      setHealthLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const formatUptime = (seconds?: number) => {
    if (seconds == null) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h > 0 && `${h}h`, m > 0 && `${m}m`, `${s}s`].filter(Boolean).join(' ');
  };

  const maskKey = (configured?: boolean) => {
    if (!configured) return 'Not configured';
    return '●●●●●●●●●●●●●●●● (set via .env)';
  };

  const healthStatusBadge =
    healthError
      ? ('DANGER' as const)
      : health?.status === 'healthy'
      ? ('SUCCESS' as const)
      : health?.status === 'degraded'
      ? ('WARN' as const)
      : ('IDLE' as const);

  const healthStatusLabel = healthError
    ? 'Error'
    : health?.status
    ? health.status.charAt(0).toUpperCase() + health.status.slice(1)
    : '—';

  // Read thresholds from health or use defaults
  const autoMergeThreshold = health?.auto_merge_threshold ?? 0.9;
  const manualReviewThreshold = health?.manual_review_threshold ?? 0.7;

  return (
    <div className="flex flex-col gap-6 max-w-3xl animate-slide-up">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-display font-bold text-[var(--color-text-primary)]">
          Platform Settings
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5 font-mono">
          Configuration, health checks, and environment status
        </p>
      </div>

      {/* ── API Health ───────────────────────────────────────────────────── */}
      <SectionCard title="API Health" icon={<Activity size={14} />} delay={0}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center border',
                healthError
                  ? 'bg-[var(--color-danger)]/10 border-[var(--color-danger)]/25'
                  : health?.status === 'healthy'
                  ? 'bg-[var(--color-success)]/10 border-[var(--color-success)]/25'
                  : 'bg-[var(--color-border)] border-[var(--color-border)]'
              )}
            >
              {healthLoading ? (
                <RefreshCw
                  size={16}
                  className="text-[var(--color-text-muted)] animate-spin"
                />
              ) : healthError ? (
                <XCircle size={18} className="text-[var(--color-danger)]" />
              ) : (
                <CheckCircle2 size={18} className="text-[var(--color-success)]" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                DataFusion API
              </p>
              <p className="text-xs font-mono text-[var(--color-text-muted)]">
                http://localhost:8000
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {healthLoading ? (
              <Skeleton className="h-6 w-20 rounded" />
            ) : (
              <StatusBadge
                status={healthStatusBadge}
                pulsing={!healthError && health?.status === 'healthy'}
              >
                {healthStatusLabel}
              </StatusBadge>
            )}
            <button
              onClick={fetchHealth}
              disabled={healthLoading}
              className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[var(--color-accent-secondary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-40"
            >
              <RefreshCw size={10} className={healthLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {healthLoading ? (
          <div className="space-y-1.5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded" />
            ))}
          </div>
        ) : health ? (
          <>
            <InfoRow
              label="AI Configured"
              value={
                <StatusBadge status={health.ai_configured ? 'SUCCESS' : 'WARN'}>
                  {health.ai_configured ? 'Yes' : 'No'}
                </StatusBadge>
              }
            />
            <InfoRow
              label="Timestamp"
              value={
                <span className="flex items-center justify-end gap-1.5 font-mono text-xs text-[var(--color-text-secondary)]">
                  <Clock size={11} />
                  {health.timestamp
                    ? new Date(health.timestamp).toLocaleString()
                    : '—'}
                </span>
              }
            />
            {health.uptime_seconds != null && (
              <InfoRow label="Uptime" value={formatUptime(health.uptime_seconds)} mono />
            )}
            {health.version && (
              <InfoRow label="Version" value={health.version} mono />
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--color-danger)] font-mono">
            Cannot reach API. Ensure the backend is running at http://localhost:8000
          </p>
        )}
      </SectionCard>

      {/* ── Azure OpenAI ─────────────────────────────────────────────────── */}
      <SectionCard title="Azure OpenAI" icon={<Key size={14} />} delay={0.05}>
        {healthLoading ? (
          <div className="space-y-1.5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded" />
            ))}
          </div>
        ) : (
          <>
            <InfoRow
              label="Endpoint"
              value={health?.azure_openai_endpoint ?? 'Not configured'}
              mono
            />
            <InfoRow
              label="Model / Deployment"
              value={health?.azure_openai_model ?? 'Not configured'}
              mono
            />
            <InfoRow
              label="API Key"
              value={
                <span className="font-mono text-xs text-[var(--color-text-muted)] tracking-wider">
                  {maskKey(
                    health?.azure_openai_key_configured ?? health?.ai_configured
                  )}
                </span>
              }
            />
            <InfoRow
              label="Connection"
              value={
                <StatusBadge status={health?.ai_configured ? 'SUCCESS' : 'WARN'}>
                  {health?.ai_configured ? 'Connected' : 'Not configured'}
                </StatusBadge>
              }
            />
            <p className="text-xs font-mono text-[var(--color-text-muted)] italic pt-1">
              Credentials are loaded from{' '}
              <code className="text-[var(--color-accent-secondary)]">.env</code>{' '}
              at startup. Edit the file to update settings.
            </p>
          </>
        )}
      </SectionCard>

      {/* ── Pipeline Thresholds ───────────────────────────────────────────── */}
      <SectionCard title="Pipeline Thresholds" icon={<Sliders size={14} />} delay={0.1}>
        {healthLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ThresholdCard
              label="Auto-Merge Threshold"
              value={autoMergeThreshold}
              description="Matches above this score are automatically merged without human review."
              color="var(--color-success)"
            />
            <ThresholdCard
              label="Manual Review Threshold"
              value={manualReviewThreshold}
              description="Matches between this and auto-merge threshold are queued for human review."
              color="var(--color-warning)"
            />
          </div>
        )}
        <p className="text-xs font-mono text-[var(--color-text-muted)] italic">
          Configure via{' '}
          <code className="text-[var(--color-accent-secondary)]">AUTO_MERGE_THRESHOLD</code> and{' '}
          <code className="text-[var(--color-accent-secondary)]">MANUAL_REVIEW_THRESHOLD</code> in{' '}
          <code className="text-[var(--color-accent-secondary)]">.env</code>. Display only.
        </p>
      </SectionCard>

      {/* ── Platform Info ─────────────────────────────────────────────────── */}
      <SectionCard title="Platform Info" icon={<Database size={14} />} delay={0.15}>
        {healthLoading ? (
          <div className="space-y-1.5">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded" />
            ))}
          </div>
        ) : (
          <>
            <InfoRow
              label="Version"
              value={health?.version ?? 'v2.0.0'}
              mono
            />
            <InfoRow
              label="Database Path"
              value={health?.db_path ?? 'golden_record.db'}
              mono
            />
            <InfoRow
              label="Kafka Broker"
              value={health?.kafka_broker ?? 'localhost:9092'}
              mono
            />
            {health?.kafka_topic && (
              <InfoRow label="Kafka Topic" value={health.kafka_topic} mono />
            )}
            <InfoRow
              label="Backend"
              value="FastAPI + Python"
              mono
            />
            <InfoRow
              label="Frontend"
              value="React 19 + Vite + Tailwind v4"
              mono
            />
          </>
        )}
      </SectionCard>

      {/* ── Appearance ───────────────────────────────────────────────────── */}
      <SectionCard
        title="Appearance"
        icon={isDarkMode ? <Moon size={14} /> : <Sun size={14} />}
        delay={0.2}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              {isDarkMode ? 'Dark Mode' : 'Light Mode'} Active
            </p>
            <p className="text-xs font-mono text-[var(--color-text-muted)] mt-0.5">
              Preference saved to localStorage under key{' '}
              <code className="text-[var(--color-accent-secondary)]">'theme'</code>
            </p>
          </div>
          <button
            onClick={() => setIsDarkMode((p) => !p)}
            className={cn(
              'relative w-12 h-6 rounded-full transition-all duration-300 border shrink-0',
              isDarkMode
                ? 'bg-[var(--color-accent-secondary)]/20 border-[var(--color-accent-secondary)]/50'
                : 'bg-[var(--color-surface-2)] border-[var(--color-border)]'
            )}
            aria-label="Toggle theme"
          >
            <div
              className={cn(
                'absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300 flex items-center justify-center',
                isDarkMode
                  ? 'left-6 bg-[var(--color-accent-secondary)]'
                  : 'left-0.5 bg-[var(--color-text-muted)]'
              )}
            >
              {isDarkMode ? (
                <Moon size={11} className="text-white" />
              ) : (
                <Sun size={11} className="text-white" />
              )}
            </div>
          </button>
        </div>
      </SectionCard>

      {/* ── Runtime ──────────────────────────────────────────────────────── */}
      <SectionCard title="Runtime" icon={<Cpu size={14} />} delay={0.25}>
        <InfoRow label="Build Mode" value={import.meta.env.MODE} mono />
        <InfoRow
          label="API Base URL"
          value={import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'}
          mono
        />
        <InfoRow label="User Platform" value={navigator.platform} mono />
      </SectionCard>
    </div>
  );
}

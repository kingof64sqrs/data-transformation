import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, CheckCircle, XCircle, SkipForward, RefreshCw } from 'lucide-react';
import api from '@/api/client';
import { SignalBreakdown } from '@/components/ui/SignalBreakdown';
import { FieldDiff } from '@/components/ui/FieldDiff';
import { AIInsightPanel } from '@/components/ui/AIInsightPanel';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import type { ReviewItem, AISuggestion } from '@/types/api';
import { cn } from '@/lib/utils';

interface ReviewStats {
  reviewed_today: number;
  total_today: number;
  pending: number;
}

// ─── Confetti particle ─────────────────────────────────────────────────────────
function ConfettiPiece({ delay, x }: { delay: number; x: number }) {
  const colors = [
    'var(--color-accent-primary)',
    'var(--color-accent-secondary)',
    'var(--color-success)',
    'var(--color-warning)',
    'var(--color-danger)',
  ];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const size = 6 + Math.random() * 8;

  return (
    <motion.div
      initial={{ y: -20, x, opacity: 1, rotate: 0, scale: 1 }}
      animate={{
        y: window.innerHeight,
        opacity: 0,
        rotate: 720 + Math.random() * 360,
        scale: 0.3,
      }}
      transition={{ duration: 2.5 + Math.random(), delay, ease: 'easeIn' }}
      className="fixed top-0 pointer-events-none z-50 rounded-sm"
      style={{ width: size, height: size, backgroundColor: color, left: 0 }}
    />
  );
}

function Confetti() {
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    delay: Math.random() * 1.5,
    x: Math.random() * window.innerWidth,
  }));

  return (
    <>
      {pieces.map((p) => (
        <ConfettiPiece key={p.id} delay={p.delay} x={p.x} />
      ))}
    </>
  );
}

// ─── Mini queue preview card ────────────────────────────────────────────────────
function MiniCard({ item }: { item: ReviewItem }) {
  const score = Math.round(item.composite_score ?? 0);
  const scoreColor =
    score >= 80
      ? 'text-[var(--color-success)]'
      : score >= 50
      ? 'text-[var(--color-warning)]'
      : 'text-[var(--color-danger)]';

  return (
    <div className="panel-border rounded-lg px-4 py-3 flex items-center gap-4 bg-[var(--color-surface-1)] min-w-[220px] shrink-0">
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
          #{item.match_id}
        </p>
        <p className="text-sm text-[var(--color-text-primary)] truncate font-medium">
          {item.record1?.full_name ?? '—'}
        </p>
        <p className="text-xs text-[var(--color-text-secondary)] truncate">
          vs {item.record2?.full_name ?? '—'}
        </p>
      </div>
      <div className={cn('font-mono font-bold text-sm tabular-nums', scoreColor)}>
        {score}%
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────
export default function ReviewWorkbench() {
  const { toast } = useToast();

  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const [deciding, setDeciding] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const LIMIT = 20;

  // ── Fetch initial queue ───────────────────────────────────────────────────
  const fetchQueue = useCallback(
    async (reset = false) => {
      const currentOffset = reset ? 0 : offset;
      if (!reset) setLoadingMore(true);
      else setLoadingQueue(true);

      try {
        const res = await api.get('/review/queue', {
          params: { limit: LIMIT, offset: currentOffset },
        });
        const items: ReviewItem[] = res.data?.queue ?? res.data?.items ?? res.data ?? [];
        if (reset) {
          setQueue(items);
          setOffset(LIMIT);
        } else {
          setQueue((prev) => [...prev, ...items]);
          setOffset((prev) => prev + LIMIT);
        }
        setHasMore(items.length === LIMIT);
      } catch {
        toast('Failed to load review queue', 'error');
      } finally {
        setLoadingQueue(false);
        setLoadingMore(false);
      }
    },
    [offset, toast]
  );

  // ── Fetch stats ───────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/review/stats');
      setStats(res.data);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    fetchQueue(true);
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch AI analysis for current item ───────────────────────────────────
  const fetchAI = useCallback(async (matchId: number) => {
    setAiSuggestion(null);
    setAiLoading(true);
    try {
      const res = await api.post('/ai/analyze-match', { match_id: matchId });
      setAiSuggestion(res.data);
    } catch {
      // AI unavailable — don't toast, just leave null
    } finally {
      setAiLoading(false);
    }
  }, []);

  const current = queue[0];

  useEffect(() => {
    if (current?.match_id) {
      fetchAI(current.match_id);
    }
  }, [current?.match_id, fetchAI]);

  // ── Decision handler ──────────────────────────────────────────────────────
  const decide = useCallback(
    async (decision: 'approve' | 'reject' | 'skip') => {
      if (!current || deciding) return;
      setDeciding(true);

      if (decision !== 'skip') {
        try {
          await api.post('/review/decide', {
            match_id: current.match_id,
            decision,
          });
          setQueue((prev) => prev.slice(1));
          setAiSuggestion(null);
          const label = decision === 'approve' ? 'Approved' : 'Rejected';
          toast(`Match #${current.match_id} — ${label}`, 'success');
          fetchStats();
        } catch {
          toast(`Failed to save decision for #${current.match_id}`, 'error');
        }
      } else {
        setQueue((prev) => prev.slice(1));
        setAiSuggestion(null);
        toast(`Match #${current.match_id} — Skipped`, 'info');
      }

      setDeciding(false);

      // Load more when near end
      if (queue.length <= 5 && hasMore) {
        fetchQueue(false);
      }
    },
    [current, deciding, hasMore, queue.length, fetchQueue, fetchStats, toast]
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowRight') decide('approve');
      if (e.key === 'r' || e.key === 'R' || e.key === 'ArrowLeft') decide('reject');
      if (e.key === 's' || e.key === 'S') decide('skip');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide]);

  // ── Empty state confetti ──────────────────────────────────────────────────
  useEffect(() => {
    if (!loadingQueue && queue.length === 0) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 3500);
      return () => clearTimeout(t);
    }
  }, [loadingQueue, queue.length]);

  // ── Build FieldDiff rows ──────────────────────────────────────────────────
  const buildFields = (item: ReviewItem) => {
    const a = item.record1;
    const b = item.record2;
    const sig = item.signals;

    return [
      {
        label: 'Name',
        value1: a?.full_name ?? null,
        value2: b?.full_name ?? null,
        similarity: sig?.name_score,
      },
      {
        label: 'Email',
        value1: a?.email ?? null,
        value2: b?.email ?? null,
        similarity: sig?.email_score,
      },
      {
        label: 'Phone',
        value1: a?.phone_number ?? null,
        value2: b?.phone_number ?? null,
        similarity: sig?.phone_score,
      },
      {
        label: 'DOB',
        value1: a?.date_of_birth ?? null,
        value2: b?.date_of_birth ?? null,
        similarity: sig?.dob_score,
      },
      {
        label: 'Address',
        value1: a?.address_line1 ?? null,
        value2: b?.address_line1 ?? null,
        similarity: sig?.address_score,
      },
      {
        label: 'City / State',
        value1: a ? `${a.city ?? ''}, ${a.state ?? ''}`.trim().replace(/^,\s*/, '') : null,
        value2: b ? `${b.city ?? ''}, ${b.state ?? ''}`.trim().replace(/^,\s*/, '') : null,
      },
    ];
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  if (loadingQueue) {
    return (
      <div className="flex flex-col gap-6 animate-slide-up max-w-5xl mx-auto">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-[420px] w-full rounded-xl" />
        <div className="flex gap-4">
          <Skeleton className="h-24 flex-1 rounded-lg" />
          <Skeleton className="h-24 flex-1 rounded-lg" />
        </div>
      </div>
    );
  }

  // ── Empty / cleared ───────────────────────────────────────────────────────
  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center animate-slide-up">
        {showConfetti && <Confetti />}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 12, stiffness: 200 }}
          className="text-7xl select-none"
        >
          🎉
        </motion.div>
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          <h2 className="text-3xl font-display font-bold text-[var(--color-text-primary)]">
            Queue cleared!
          </h2>
          <p className="text-[var(--color-text-secondary)] font-mono text-sm">
            All pending matches have been reviewed. Great work!
          </p>
          {stats && (
            <p className="text-[var(--color-accent-secondary)] font-mono text-xs uppercase tracking-widest">
              {stats.reviewed_today} decisions made today
            </p>
          )}
        </motion.div>
        <motion.button
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          onClick={() => fetchQueue(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg panel-border text-sm font-mono font-bold uppercase tracking-wider text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)] transition-colors"
        >
          <RefreshCw size={14} /> Refresh Queue
        </motion.button>
      </div>
    );
  }

  const preview = queue.slice(1, 5);

  return (
    <div className="flex flex-col gap-4 max-w-5xl mx-auto animate-slide-up">

      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-display font-bold text-[var(--color-text-primary)]">
            Review Workbench
          </h1>
          {stats && (
            <p className="text-xs font-mono text-[var(--color-text-muted)] mt-0.5">
              {stats.reviewed_today} of {stats.total_today} reviewed today
            </p>
          )}
        </div>

        {/* Remaining counter */}
        <div className="flex items-center gap-3">
          <div className="panel-border rounded-lg px-4 py-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-warning)] animate-pulse" />
            <span className="font-mono font-bold text-[var(--color-warning)] tabular-nums text-sm">
              {queue.length}
            </span>
            <span className="font-mono text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
              remaining
            </span>
          </div>
          <button
            onClick={() => fetchQueue(true)}
            className="panel-border rounded-lg p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)] transition-colors"
            title="Refresh queue"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* ── Keyboard shortcut hint bar ──────────────────────────────────── */}
      <div className="flex items-center justify-center gap-6 px-5 py-2.5 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)] text-xs font-mono text-[var(--color-text-muted)]">
        {[
          { key: 'A / →', label: 'Approve', color: 'var(--color-success)' },
          { key: 'R / ←', label: 'Reject', color: 'var(--color-danger)' },
          { key: 'S', label: 'Skip', color: 'var(--color-text-muted)' },
        ].map(({ key, label, color }) => (
          <div key={label} className="flex items-center gap-2">
            <kbd
              className="inline-flex items-center justify-center px-2 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[10px] font-mono font-bold"
              style={{ color }}
            >
              {key}
            </kbd>
            <span style={{ color }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Main card ──────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current.match_id}
          initial={{ opacity: 0, x: 60, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -60, scale: 0.97, filter: 'blur(2px)' }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="panel-border rounded-xl overflow-hidden flex flex-col gap-0"
        >
          {/* Match ID strip */}
          <div className="flex items-center justify-between px-5 py-3 bg-[var(--color-surface-2)] border-b border-[var(--color-border)]">
            <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              Match ID{' '}
              <span className="text-[var(--color-accent-secondary)] font-bold">
                #{current.match_id}
              </span>
            </span>
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              Composite score:{' '}
              <span
                className={cn(
                  'font-bold',
                  (current.composite_score ?? 0) >= 80
                    ? 'text-[var(--color-success)]'
                    : (current.composite_score ?? 0) >= 50
                    ? 'text-[var(--color-warning)]'
                    : 'text-[var(--color-danger)]'
                )}
              >
                {Math.round(current.composite_score ?? 0)}%
              </span>
            </span>
          </div>

          {/* Field diff comparison */}
          <div className="px-5 py-4">
            <FieldDiff
              fields={buildFields(current)}
              label1={`Record A — ${current.record1?.customer_id ?? '?'}`}
              label2={`Record B — ${current.record2?.customer_id ?? '?'}`}
            />
          </div>

          {/* Signals + AI side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-5 pb-4">
            <div className="panel-border rounded-xl p-4 bg-[var(--color-surface-2)]">
              <SignalBreakdown
                signals={current.signals}
                composite_score={current.composite_score}
                ai_confidence={current.ai_confidence}
              />
            </div>
            <AIInsightPanel
              suggestion={aiSuggestion}
              loading={aiLoading}
              onFetch={() => fetchAI(current.match_id)}
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 px-5 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <button
              onClick={() => decide('reject')}
              disabled={deciding}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-mono font-bold text-sm uppercase tracking-wider transition-all',
                'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/40',
                'hover:bg-[var(--color-danger)]/20 hover:border-[var(--color-danger)]/70',
                'hover:shadow-[0_0_20px_var(--color-danger)/20]',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              <XCircle size={16} />
              <span>Reject</span>
              <ArrowLeft size={13} className="opacity-50" />
            </button>

            <button
              onClick={() => decide('skip')}
              disabled={deciding}
              className="px-4 py-3 rounded-xl font-mono text-xs uppercase tracking-wider text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-[var(--color-accent-primary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-40"
            >
              <SkipForward size={14} />
            </button>

            <button
              onClick={() => decide('approve')}
              disabled={deciding}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-mono font-bold text-sm uppercase tracking-wider transition-all',
                'bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/40',
                'hover:bg-[var(--color-success)]/20 hover:border-[var(--color-success)]/70',
                'hover:shadow-[0_0_20px_var(--color-success)/20]',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              <ArrowRight size={13} className="opacity-50" />
              <span>Approve</span>
              <CheckCircle size={16} />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ── Queue preview ───────────────────────────────────────────────── */}
      {preview.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] px-1">
            Up next
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {preview.map((item) => (
              <MiniCard key={item.match_id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* ── Load more ───────────────────────────────────────────────────── */}
      {hasMore && queue.length > 0 && (
        <button
          onClick={() => fetchQueue(false)}
          disabled={loadingMore}
          className="w-full py-2.5 rounded-lg panel-border font-mono text-xs uppercase tracking-wider text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)] transition-colors disabled:opacity-40"
        >
          {loadingMore ? 'Loading more…' : 'Load more items'}
        </button>
      )}
    </div>
  );
}

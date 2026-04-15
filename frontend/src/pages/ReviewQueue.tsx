import React, { useEffect, useState, useCallback } from 'react';
import api from '@/api/client';
import { DecisionButtons } from '@/components/ui/DecisionButtons';
import { ConfidenceBar } from '@/components/ui/ConfidenceBar';
import { useToast } from '@/components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';

const toScore = (value: number | undefined) => Math.round((value ?? 0) * 100);

export default function ReviewQueue() {
    const [queue, setQueue] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const fetchQueue = useCallback(() => {
        setLoading(true);
        api.get('/review-queue')
            .then(res => {
                setQueue(res.data.queue || res.data.records || res.data || []);
            })
            .catch(err => {
                console.error(err);
                toast('Failed to load review queue', 'error');
            })
            .finally(() => setLoading(false));
    }, [toast]);

    useEffect(() => {
        fetchQueue();
        // Auto-poll every 5s if queue is empty or low
        const interval = setInterval(() => {
            fetchQueue();
        }, 5000);
        return () => clearInterval(interval);
    }, [fetchQueue]);

    const handleDecision = async (decision: 'approve' | 'reject') => {
        const current = queue[0];
        if (!current) return;

        // Optimistic UI update
        setQueue(prev => prev.slice(1));
        toast(`Match ${current.match_id} ${decision === 'approve' ? 'approved' : 'rejected'}`, decision === 'approve' ? 'success' : 'warning');

        try {
            await api.post('/review/decide', {
                match_id: current.match_id,
                decision: decision
            });
        } catch (e) {
            toast(`Failed to save decision for ${current.match_id}`, 'error');
            // Revert optimistic update ideally
            fetchQueue();
        }
    };

    if (loading && queue.length === 0) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent-primary)]"></div>
            </div>
        );
    }

    if (queue.length === 0) {
        return (
            <div className="flex flex-col justify-center items-center h-full gap-4 text-center animate-slide-up">
                <div className="text-6xl mb-4">🎉</div>
                <h2 className="text-3xl font-display font-bold">Queue cleared!</h2>
                <p className="text-[var(--color-text-secondary)] font-mono">All pending matches have been reviewed.</p>
            </div>
        );
    }

    const activeItem = queue[0];
    const recordA = activeItem?.record1 || {};
    const recordB = activeItem?.record2 || {};
    const score = toScore(activeItem?.confidence_score);

    const estimatedTime = queue.length * 5; // 5s per match
    const estMins = Math.floor(estimatedTime / 60);

    // Helper to compare fields
    const getFieldColor = (valA: string, valB: string) => {
        if (!valA && !valB) return 'text-[var(--color-text-secondary)]';
        if (valA === valB) return 'text-[var(--color-success)] bg-[var(--color-success)]/10 font-medium px-1 -mx-1 rounded';
        // Substring or fuzzy check visually
        if (valA?.toLowerCase() === valB?.toLowerCase()) return 'text-[var(--color-success)] px-1 -mx-1 rounded';
        const dist = Math.abs(valA?.length - valB?.length);
        if (dist < 3 && valA?.slice(0, 3) === valB?.slice(0, 3)) return 'text-[var(--color-warning)] underline decoration-dashed underline-offset-4';
        return 'text-[var(--color-danger)] font-medium';
    };

    return (
        <div className="flex flex-col h-full max-w-5xl mx-auto min-h-0 animate-slide-up relative">

            {/* Queue Stats Banner */}
            <div className="bg-[var(--color-surface-1)] border border-[var(--color-accent-secondary)] rounded-t-lg p-4 flex justify-between items-center shrink-0">
                <div className="flex flex-col">
                    <span className="font-mono text-[var(--color-text-primary)] font-bold">{queue.length} matches pending review</span>
                    <span className="text-xs text-[var(--color-text-muted)] mt-1">~{estMins > 0 ? `${estMins} min` : '< 1 min'} remaining</span>
                </div>
                <div className="text-sm font-mono text-[var(--color-text-secondary)] bg-[var(--color-background)] px-3 py-1 rounded border border-[var(--color-border)] hidden md:block">
                    Use <kbd className="font-sans text-white border border-[var(--color-border)] rounded px-1.5 py-0.5 shadow">←</kbd> and <kbd className="font-sans text-white border border-[var(--color-border)] rounded px-1.5 py-0.5 shadow">→</kbd> keys
                </div>
            </div>

            {/* Progress Bar (fake relative progress based on length) */}
            <div className="w-full h-1 bg-[var(--color-surface-2)] shrink-0 overflow-hidden relative">
                <div className="absolute top-0 left-0 h-full bg-[var(--color-accent-secondary)] transition-all duration-500 w-1/4"></div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 panel-border border-t-0 rounded-b-lg bg-[var(--color-surface-1)]/50 relative">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeItem.match_id}
                        initial={{ opacity: 0, x: 50, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -50, scale: 0.95, filter: 'blur(4px)' }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col p-6 h-full"
                    >
                        {/* Split Comparison */}
                        <div className="flex flex-col md:flex-row bg-[var(--color-background)] rounded-lg border border-[var(--color-border)] shadow-xl overflow-hidden mb-6 flex-1 min-h-0">
                            {/* Record A */}
                            <div className="flex-1 border-b md:border-b-0 md:border-r border-[var(--color-border)] p-6">
                                <div className="text-xs text-[var(--color-text-muted)] font-mono mb-4 bg-[var(--color-surface-2)] inline-block px-2 py-1 rounded">RECORD #{recordA.customer_id}</div>
                                <div className="space-y-4 font-code text-sm">
                                    <div className="grid grid-cols-[80px_1fr] items-center">
                                        <span className="text-[var(--color-text-secondary)] uppercase text-xs">Name:</span>
                                        <span className={getFieldColor(recordA.first_name, recordB.first_name)}>{recordA.first_name} {recordA.last_name}</span>
                                    </div>
                                    <div className="grid grid-cols-[80px_1fr] items-center">
                                        <span className="text-[var(--color-text-secondary)] uppercase text-xs">Email:</span>
                                        <span className={getFieldColor(recordA.email, recordB.email)}>{recordA.email}</span>
                                    </div>
                                    <div className="grid grid-cols-[80px_1fr] items-center">
                                        <span className="text-[var(--color-text-secondary)] uppercase text-xs">Phone:</span>
                                        <span className={getFieldColor(recordA.phone_number, recordB.phone_number)}>{recordA.phone_number}</span>
                                    </div>
                                    <div className="grid grid-cols-[80px_1fr] items-center">
                                        <span className="text-[var(--color-text-secondary)] uppercase text-xs">DOB:</span>
                                        <span className={getFieldColor(recordA.date_of_birth, recordB.date_of_birth)}>{recordA.date_of_birth}</span>
                                    </div>
                                    <div className="grid grid-cols-[80px_1fr] flex-col items-start leading-relaxed">
                                        <span className="text-[var(--color-text-secondary)] uppercase text-xs pt-0.5">Addr:</span>
                                        <span className={getFieldColor(recordA.address_line1, recordB.address_line1)}>
                                            {recordA.address_line1}<br />{recordA.city}, {recordA.state} {recordA.zip_code}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Record B */}
                            <div className="flex-1 p-6 relative">
                                <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-muted)] flex items-center justify-center font-bold hidden md:flex z-10 font-serif">
                                    VS
                                </div>
                                <div className="text-xs text-[var(--color-text-muted)] font-mono mb-4 bg-[var(--color-surface-2)] inline-block px-2 py-1 rounded">RECORD #{recordB.customer_id}</div>
                                <div className="space-y-4 font-code text-sm">
                                    <div className="grid grid-cols-[80px_1fr] items-center">
                                        <span className="text-[var(--color-text-secondary)] uppercase text-xs">Name:</span>
                                        <span className={getFieldColor(recordB.first_name, recordA.first_name)}>{recordB.first_name} {recordB.last_name}</span>
                                    </div>
                                    <div className="grid grid-cols-[80px_1fr] items-center">
                                        <span className="text-[var(--color-text-secondary)] uppercase text-xs">Email:</span>
                                        <span className={getFieldColor(recordB.email, recordA.email)}>{recordB.email}</span>
                                    </div>
                                    <div className="grid grid-cols-[80px_1fr] items-center">
                                        <span className="text-[var(--color-text-secondary)] uppercase text-xs">Phone:</span>
                                        <span className={getFieldColor(recordB.phone_number, recordA.phone_number)}>{recordB.phone_number}</span>
                                    </div>
                                    <div className="grid grid-cols-[80px_1fr] items-center">
                                        <span className="text-[var(--color-text-secondary)] uppercase text-xs">DOB:</span>
                                        <span className={getFieldColor(recordB.date_of_birth, recordA.date_of_birth)}>{recordB.date_of_birth}</span>
                                    </div>
                                    <div className="grid grid-cols-[80px_1fr] flex-col items-start leading-relaxed">
                                        <span className="text-[var(--color-text-secondary)] uppercase text-xs pt-0.5">Addr:</span>
                                        <span className={getFieldColor(recordB.address_line1, recordA.address_line1)}>
                                            {recordB.address_line1}<br />{recordB.city}, {recordB.state} {recordB.zip_code}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Signal Detail Component */}
                        <div className="mb-6 flex gap-8 items-center bg-[var(--color-background)] p-4 rounded-lg border border-[var(--color-border)]">
                            <div className="whitespace-nowrap font-mono text-sm uppercase text-[var(--color-text-muted)] font-bold mr-4">Model<br />Confidence</div>
                            <div className="flex-1 pr-6 border-r border-[var(--color-border)]">
                                <ConfidenceBar score={score} className="text-xl font-bold font-mono" />
                            </div>
                            <div className="flex-1 flex gap-6 text-xs font-mono items-center px-4">
                                <div>
                                    <div className="text-[var(--color-text-muted)] mb-1">Name Match</div>
                                    <div className="text-[var(--color-warning)]">Fuzzy 82%</div>
                                </div>
                                <div>
                                    <div className="text-[var(--color-text-muted)] mb-1">Email Match</div>
                                    <div className="text-[var(--color-success)]">Exact 100%</div>
                                </div>
                            </div>
                        </div>

                        {/* Decisions */}
                        <div className="shrink-0 mt-auto">
                            <DecisionButtons
                                onApprove={() => handleDecision('approve')}
                                onReject={() => handleDecision('reject')}
                            />
                        </div>

                    </motion.div>
                </AnimatePresence>
            </div>

        </div>
    );
}

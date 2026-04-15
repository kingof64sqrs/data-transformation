import React from 'react';
import { cn } from '@/lib/utils';
import { ConfidenceBar } from './ConfidenceBar';
import { StatusBadge } from './StatusBadge';

export interface MatchSignal {
    name: string;
    score: number;
}

export interface MatchRecordData {
    id: string;
    name: string;
    email: string;
    phone: string;
}

export interface MatchCardProps {
    matchId: string;
    status: 'pending' | 'auto-merged' | 'rejected';
    confidence: number;
    recordA: MatchRecordData;
    recordB: MatchRecordData;
    signals: MatchSignal[];
    className?: string;
    onApprove?: () => void;
    onReject?: () => void;
}

export const MatchCard: React.FC<MatchCardProps> = ({
    matchId,
    status,
    confidence,
    recordA,
    recordB,
    signals,
    className,
    onApprove,
    onReject
}) => {
    const getBadgeStatus = (): "SUCCESS" | "WARN" | "DANGER" | "INFO" | "IDLE" => {
        if (status === 'auto-merged') return 'SUCCESS';
        if (status === 'rejected') return 'DANGER';
        return 'WARN';
    };

    const statusLabel = status === 'pending' ? 'PENDING REVIEW' : status.toUpperCase();

    return (
        <div className={cn("panel-border bg-[var(--color-surface-1)] rounded-lg flex flex-col group transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,229,255,0.15)]", className)}>

            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                <h3 className="font-mono text-sm tracking-wide font-bold">MATCH <span className="text-[var(--color-text-muted)]">#{matchId}</span></h3>
                <StatusBadge status={getBadgeStatus()} pulsing={status === 'pending'}>{statusLabel}</StatusBadge>
            </div>

            {/* Comparisons */}
            <div className="flex md:flex-row flex-col border-b border-[var(--color-border)] text-sm">
                <div className="flex-1 p-4 border-r border-[var(--color-border)] md:border-b-0 border-b border-[var(--color-border)] space-y-2">
                    <div className="text-xs text-[var(--color-text-muted)] font-mono mb-2">RECORD A</div>
                    <div className="font-medium text-[var(--color-text-primary)]">{recordA.name}</div>
                    <div className="text-[var(--color-text-secondary)]">{recordA.email}</div>
                    <div className="text-[var(--color-text-secondary)] font-mono text-xs">{recordA.phone}</div>
                </div>
                <div className="flex-1 p-4 space-y-2 relative">
                    {/* subtle link indicator in middle */}
                    <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-full p-1 z-10 hidden md:block text-[var(--color-text-muted)]">
                        ↔
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] font-mono mb-2">RECORD B</div>
                    <div className="font-medium text-[var(--color-text-primary)]">{recordB.name}</div>
                    <div className="text-[var(--color-text-secondary)]">{recordB.email}</div>
                    <div className="text-[var(--color-text-secondary)] font-mono text-xs">{recordB.phone}</div>
                </div>
            </div>

            {/* Breakdown */}
            <div className="p-4 bg-[var(--color-surface-2)]/50 space-y-3">
                <div className="text-xs font-mono text-[var(--color-text-muted)] mb-3 tracking-widest uppercase">Signal Breakdown</div>
                <div className="space-y-3">
                    {signals.map((sig, i) => (
                        <ConfidenceBar key={i} score={sig.score} label={sig.name} />
                    ))}
                </div>
            </div>

            {/* Footer / Overall Score */}
            <div className="p-4 border-t border-[var(--color-border)] flex items-center justify-between">
                <div className="flex-1 mr-6">
                    <ConfidenceBar score={confidence} label="Overall Confidence" className="font-bold font-mono" />
                </div>

                {/* Actions if pending */}
                {status === 'pending' && onApprove && onReject && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onReject}
                            className="w-8 h-8 flex items-center justify-center rounded bg-[var(--color-danger)]/10 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 transition-colors border border-[var(--color-danger)]/30"
                            title="Reject"
                        >
                            ✗
                        </button>
                        <button
                            onClick={onApprove}
                            className="w-8 h-8 flex items-center justify-center rounded bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)]/20 transition-colors border border-[var(--color-success)]/30"
                            title="Approve"
                        >
                            ✓
                        </button>
                    </div>
                )}
            </div>

        </div>
    );
};

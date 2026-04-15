import React from 'react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
    status: 'SUCCESS' | 'WARN' | 'DANGER' | 'INFO' | 'IDLE';
    children: React.ReactNode;
    className?: string;
    pulsing?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, children, className, pulsing = false }) => {
    const variants = {
        SUCCESS: 'bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30',
        WARN: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/30',
        DANGER: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30',
        INFO: 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] border border-[var(--color-accent-primary)]/30',
        IDLE: 'bg-[var(--color-text-muted)]/10 text-[var(--color-text-secondary)] border border-[var(--color-border)]'
    };

    const dotColors = {
        SUCCESS: 'bg-[var(--color-success)]',
        WARN: 'bg-[var(--color-warning)]',
        DANGER: 'bg-[var(--color-danger)]',
        INFO: 'bg-[var(--color-accent-primary)]',
        IDLE: 'bg-[var(--color-text-muted)]'
    };

    return (
        <div className={cn("inline-flex items-center gap-2 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap", variants[status], className)}>
            <span className={cn("w-1.5 h-1.5 rounded-full", dotColors[status], pulsing && "animate-pulse")} />
            {children}
        </div>
    );
};

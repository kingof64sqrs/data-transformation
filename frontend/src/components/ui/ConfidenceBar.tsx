import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface ConfidenceBarProps {
    score: number; // 0-100
    label?: string;
    showPercentage?: boolean;
    className?: string;
}

export const ConfidenceBar: React.FC<ConfidenceBarProps> = ({ score, label, showPercentage = true, className }) => {
    const getColor = (s: number) => {
        if (s >= 80) return 'var(--color-success)';
        if (s >= 50) return 'var(--color-warning)';
        return 'var(--color-danger)'; // Red
    };

    const pct = Math.max(0, Math.min(100, score ?? 0));
    const color = getColor(pct);

    return (
        <div className={cn("flex flex-col gap-1 w-full", className)}>
            <div className="flex justify-between text-xs font-mono">
                {label && <span className="text-[var(--color-text-secondary)]">{label}</span>}
                {showPercentage && <span style={{ color }}>{pct}%</span>}
            </div>
            <div className="h-2 w-full bg-[var(--color-surface-2)] rounded-full overflow-hidden border border-[var(--color-border)]">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full rounded-full relative"
                    style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }}
                />
            </div>
        </div>
    );
};

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
        if (s >= 90) return 'var(--color-success)'; // Green
        if (s >= 75) return 'var(--color-warning)'; // Amber
        return 'var(--color-danger)'; // Red
    };

    const color = getColor(score);

    return (
        <div className={cn("flex flex-col gap-1 w-full", className)}>
            <div className="flex justify-between text-xs font-mono">
                {label && <span className="text-[var(--color-text-secondary)]">{label}</span>}
                {showPercentage && <span style={{ color }}>{score}%</span>}
            </div>
            <div className="h-2 w-full bg-[var(--color-surface-2)] rounded-full overflow-hidden border border-[var(--color-border)]">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full rounded-full relative"
                    style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }}
                />
            </div>
        </div>
    );
};

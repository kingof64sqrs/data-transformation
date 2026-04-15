import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface KpiCardProps {
    title: string;
    value: number;
    delta?: string;
    colorClass: string;
    animDuration?: number;
}

export const KpiCard: React.FC<KpiCardProps> = ({
    title,
    value,
    delta,
    colorClass,
    animDuration = 0.8
}) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        let startTimestamp: number | null = null;
        const step = (timestamp: number) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / (animDuration * 1000), 1);
            // easeOut cubic
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            setDisplayValue(Math.floor(easeProgress * value));
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                setDisplayValue(value);
            }
        };
        window.requestAnimationFrame(step);
    }, [value, animDuration]);

    return (
        <div className={cn("panel-border bg-[var(--color-surface-1)] rounded-lg p-5 flex flex-col justify-between relative overflow-hidden group min-h-[110px]", colorClass)}>
            {/* Left indicator bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-current opacity-80" />

            {/* Subtle radial glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-current opacity-0 group-hover:opacity-5 transition-opacity duration-500 rounded-full blur-3xl pointer-events-none" />

            <div className="flex justify-between items-start w-full z-10">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-4xl font-display font-bold tracking-tight text-[var(--color-text-primary)]"
                >
                    {displayValue.toLocaleString()}
                </motion.div>
                {delta && (
                    <div className="text-xs font-mono bg-white/5 px-2 py-1 rounded text-current border border-current/20">
                        {delta}
                    </div>
                )}
            </div>
            <div className="text-sm text-[var(--color-text-secondary)] font-mono z-10 uppercase tracking-widest mt-2">{title}</div>
        </div>
    );
};

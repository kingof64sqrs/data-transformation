import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface LogEntry {
    level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'DONE';
    message: string;
    timestamp: string;
}

interface TerminalLogProps {
    logs: LogEntry[];
    className?: string;
    autoScroll?: boolean;
}

export const TerminalLog: React.FC<TerminalLogProps> = ({ logs, className, autoScroll = true }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (autoScroll && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    const getLevelColor = (level: LogEntry['level']) => {
        switch (level) {
            case 'SUCCESS': return 'text-[var(--color-success)]';
            case 'WARN': return 'text-[var(--color-warning)]';
            case 'ERROR': return 'text-[var(--color-danger)]';
            case 'DONE': return 'text-[var(--color-accent-primary)]';
            default: return 'text-[var(--color-text-muted)]';
        }
    };

    return (
        <div
            ref={containerRef}
            className={cn(
                "panel-border bg-[#05080f] rounded-lg p-4 font-code text-sm overflow-y-auto relative mask-image:linear-gradient(to_bottom,transparent,black_10px,black)",
                className
            )}
        >
            {/* Subtle scanline overlay effect for terminal realism */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20 z-0"></div>

            <div className="relative z-10 flex flex-col gap-1.5">
                {logs.map((log, i) => (
                    <div key={i} className="flex gap-3 hover:bg-white/[0.02] -mx-2 px-2 py-0.5 rounded transition-colors group animate-slide-up" style={{ animationDelay: `${i * 20}ms` }}>
                        <span className="text-[var(--color-text-muted)] shrink-0 w-[85px]">[{log.timestamp}]</span>
                        <span className={cn("shrink-0 w-[65px] font-bold tracking-wide", getLevelColor(log.level))}>
                            {log.level}
                        </span>
                        <span className="text-[var(--color-text-primary)] group-hover:text-white transition-colors">{log.message}</span>
                    </div>
                ))}
                {logs.length === 0 && (
                    <div className="text-[var(--color-text-muted)] italic">Waiting for input...</div>
                )}
            </div>
        </div>
    );
};

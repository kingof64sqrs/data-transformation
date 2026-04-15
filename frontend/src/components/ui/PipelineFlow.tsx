import React from 'react';
import { cn } from '@/lib/utils';
import { Database, Filter, Variable, GitMerge, Award } from 'lucide-react';
import { motion } from 'framer-motion';

export interface PipelineStage {
    id: string;
    label: string;
    count: number;
    status: 'healthy' | 'degraded' | 'processing' | 'idle';
    icon: 'source' | 'bronze' | 'silver' | 'matching' | 'gold';
}

interface PipelineFlowProps {
    stages: PipelineStage[];
    onStageClick?: (stageId: string) => void;
    isRunning?: boolean;
}

export const PipelineFlow: React.FC<PipelineFlowProps> = ({ stages, onStageClick, isRunning }) => {
    const safeCount = (count: number | null | undefined) => Number(count ?? 0);

    const getIcon = (type: PipelineStage['icon']) => {
        switch (type) {
            case 'source': return <Database size={20} />;
            case 'bronze': return <Database size={20} className="text-[#cd7f32]" />;
            case 'silver': return <Filter size={20} className="text-[#C0C0C0]" />;
            case 'matching': return <Variable size={20} className="text-[var(--color-accent-secondary)]" />;
            case 'gold': return <Award size={20} className="text-[var(--color-warning)]" />;
            default: return <Database size={20} />;
        }
    };

    const getStatusColor = (status: PipelineStage['status']) => {
        switch (status) {
            case 'healthy': return 'bg-[var(--color-surface-1)] text-[var(--color-success)] border-[var(--color-border)] shadow-sm group-hover:border-[var(--color-success)] group-hover:shadow-[0_0_12px_var(--color-success)]';
            case 'degraded': return 'bg-[var(--color-surface-1)] text-[var(--color-warning)] border-[var(--color-warning)] shadow-sm shadow-[var(--color-warning)]';
            case 'processing': return 'bg-[var(--color-surface-2)] text-[var(--color-accent-primary)] border-[var(--color-accent-primary)] shadow-[0_0_12px_rgba(0,130,155,0.4)]';
            case 'idle': return 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border-[var(--color-border)]';
        }
    };

    return (
        <div className="w-full py-8 overflow-x-auto relative min-h-[200px] flex items-center justify-center">

            {/* Background connecting line passing through all nodes */}
            <div className="absolute top-1/2 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--color-border)] to-transparent -translate-y-1/2 z-0" />

            {isRunning && (
                <div className="absolute top-1/2 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--color-accent-primary)] to-transparent -translate-y-1/2 z-0 animate-scanning-line opacity-50" />
            )}

            <div className="relative z-10 flex items-center justify-between w-full max-w-5xl px-8 gap-4">
                {stages.map((stage, i) => (
                    <React.Fragment key={stage.id}>
                        {/* The Node */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.1 }}
                            onClick={() => onStageClick && onStageClick(stage.id)}
                            className={cn(
                                "flex flex-col items-center justify-center gap-3 cursor-pointer group shrink-0"
                            )}
                        >
                            <div className={cn(
                                "w-14 h-14 rounded-2xl flex border-2 items-center justify-center transition-all duration-300 relative bg-[var(--color-surface-1)]",
                                getStatusColor(stage.status),
                                stage.status === 'processing' ? 'animate-pulse' : 'group-hover:scale-110'
                            )}>
                                {getIcon(stage.icon)}

                                {/* Ping animation if processing */}
                                {stage.status === 'processing' && (
                                    <span className="absolute inset-0 rounded-2xl border-2 border-[var(--color-accent-primary)] animate-ping opacity-75"></span>
                                )}
                            </div>

                            <div className="flex flex-col items-center text-center">
                                <span className="font-mono text-sm tracking-wider font-bold text-[var(--color-text-primary)] uppercase">{stage.label}</span>
                                <span className="font-mono text-xs text-[var(--color-text-muted)] mt-1">{safeCount(stage.count).toLocaleString()}</span>
                            </div>
                        </motion.div>

                        {/* Path connector between nodes (except last) */}
                        {i < stages.length - 1 && (
                            <div className="flex-1 min-w-[40px] px-2 flex justify-center items-center relative">
                                {/* Arrow indicator */}
                                <div className="w-full text-[var(--color-border)] flex justify-center items-center">
                                    <span className="text-[10px] w-full text-center">──────────→</span>
                                </div>
                                {/* Animated particle flow if healthy or running */}
                                {(stage.status === 'healthy' || stage.status === 'processing') && (
                                    <motion.div
                                        initial={{ x: "-100%", opacity: 0 }}
                                        animate={{ x: "100%", opacity: [0, 1, 0] }}
                                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear", delay: i * 0.2 }}
                                        className="absolute w-2 h-2 rounded-full bg-[var(--color-accent-primary)] shadow-[0_0_8px_var(--color-accent-primary)]"
                                    />
                                )}
                            </div>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

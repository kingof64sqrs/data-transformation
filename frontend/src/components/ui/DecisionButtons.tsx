import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { X, Check } from 'lucide-react';

interface DecisionButtonsProps {
    onApprove: () => void;
    onReject: () => void;
    className?: string;
    disabled?: boolean;
}

export const DecisionButtons: React.FC<DecisionButtonsProps> = ({ onApprove, onReject, className, disabled }) => {
    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (disabled) return;
            if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'a') {
                onApprove();
            } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'r') {
                onReject();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onApprove, onReject, disabled]);

    return (
        <div className={cn("flex w-full gap-4", className)}>
            <button
                onClick={onReject}
                disabled={disabled}
                className="flex-1 flex flex-col items-center justify-center gap-2 py-6 rounded-lg bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30 hover:bg-[var(--color-danger)]/20 hover:border-[var(--color-danger)]/60 transition-all font-display disabled:opacity-50 group shadow-[0_0_15px_rgba(255,69,103,0.1)] hover:shadow-[0_0_25px_rgba(255,69,103,0.3)]"
            >
                <X size={32} className="group-hover:scale-110 transition-transform" />
                <div className="flex flex-col items-center gap-1">
                    <span className="text-xl font-bold tracking-widest uppercase">Reject</span>
                    <span className="text-xs font-mono opacity-70">Keep Separate (R / ←)</span>
                </div>
            </button>

            <button
                onClick={onApprove}
                disabled={disabled}
                className="flex-1 flex flex-col items-center justify-center gap-2 py-6 rounded-lg bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30 hover:bg-[var(--color-success)]/20 hover:border-[var(--color-success)]/60 transition-all font-display disabled:opacity-50 group shadow-[0_0_15px_rgba(0,245,160,0.1)] hover:shadow-[0_0_25px_rgba(0,245,160,0.3)]"
            >
                <Check size={32} className="group-hover:scale-110 transition-transform" />
                <div className="flex flex-col items-center gap-1">
                    <span className="text-xl font-bold tracking-widest uppercase">Approve</span>
                    <span className="text-xs font-mono opacity-70">Merge Records (A / →)</span>
                </div>
            </button>
        </div>
    );
};

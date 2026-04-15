import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Toast {
    id: string;
    message: string;
    type?: 'success' | 'info' | 'warning' | 'error';
}

interface ToastContextValue {
    toast: (message: string, type?: Toast['type']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { id, message, type }]);

        // Auto dismiss after 4s
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const getTypeStyle = (type: Toast['type']) => {
        switch (type) {
            case 'success': return 'border-[var(--color-success)]/50 bg-[var(--color-success)]/10 text-[var(--color-success)]';
            case 'error': return 'border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 text-[var(--color-danger)]';
            case 'warning': return 'border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10 text-[var(--color-warning)]';
            default: return 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-primary)]';
        }
    };

    return (
        <ToastContext.Provider value={{ toast: addToast }}>
            {children}
            <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none w-full max-w-sm">
                <AnimatePresence>
                    {toasts.map(t => (
                        <motion.div
                            key={t.id}
                            initial={{ opacity: 0, y: 50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            className={cn(
                                "pointer-events-auto flex items-start justify-between gap-3 p-4 rounded border backdrop-blur-md shadow-2xl font-mono text-sm tracking-wide",
                                getTypeStyle(t.type)
                            )}
                        >
                            <span>{t.message}</span>
                            <button onClick={() => removeToast(t.id)} className="opacity-50 hover:opacity-100 transition-opacity">
                                <X size={16} />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error("useToast must be used within ToastProvider");
    return context;
};

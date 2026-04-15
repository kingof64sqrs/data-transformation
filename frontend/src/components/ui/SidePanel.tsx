import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface SidePanelProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
}

export const SidePanel: React.FC<SidePanelProps> = ({ isOpen, onClose, title, children }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ x: '100%', boxShadow: '0 0 0 rgba(0,0,0,0)' }}
                        animate={{ x: 0, boxShadow: '-10px 0 30px rgba(0,0,0,0.5)' }}
                        exit={{ x: '100%', boxShadow: '0 0 0 rgba(0,0,0,0)' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed top-0 right-0 h-screen w-full max-w-[450px] bg-[var(--color-surface-2)] border-l border-[var(--color-border)] z-50 flex flex-col"
                    >
                        {/* Edge Highlight Glow */}
                        <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-[var(--color-accent-primary)]/30 to-transparent" />

                        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
                            <h2 className="text-xl font-display font-medium text-[var(--color-text-primary)]">{title}</h2>
                            <button
                                onClick={onClose}
                                className="text-[var(--color-text-secondary)] hover:text-[#FF4567] bg-[var(--color-surface-2)] hover:bg-[#FF4567]/10 p-2 rounded-full transition-colors border border-[var(--color-border)] hover:border-[#FF4567]/30"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 relative">
                            {children}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

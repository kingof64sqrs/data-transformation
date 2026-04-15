import React, { useEffect, useState } from 'react';
import { User, Sun, Moon } from 'lucide-react';
import api from '@/api/client';

export const LiveSourcePill = () => {
    const [status, setStatus] = useState<'connected' | 'error' | 'idle'>('connected');

    useEffect(() => {
        // Health check polling
        const interval = setInterval(() => {
            api.get('/health').then(() => setStatus('connected')).catch(() => setStatus('error'));
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-border)] text-xs font-mono select-none cursor-pointer hover:border-[var(--color-accent-primary)] transition-colors group">
            <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-[var(--color-success)] animate-pulse shadow-[0_0_8px_rgba(0,245,160,0.8)]' : 'bg-[var(--color-danger)]'}`}></span>
                <span className={`uppercase font-bold tracking-wider ${status === 'connected' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                    {status === 'connected' ? 'LIVE' : 'DISCONNECTED'}
                </span>
            </div>
            <span className="text-[var(--color-text-muted)]">·</span>
            <span className="text-[var(--color-text-secondary)]">kafka@localhost:9092</span>
            <span className="text-[var(--color-text-muted)]">·</span>
            <span className="text-[var(--color-text-primary)]">1,200 records</span>
        </div>
    );
};

const TopNavBar = () => {
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const saved = localStorage.getItem('theme');
        if (saved) return saved === 'dark';
        return true; // Default enterprise theme is dark
    });

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDarkMode]);

    const toggleTheme = () => setIsDarkMode(prev => !prev);

    return (
        <header className="h-[60px] bg-[var(--color-surface-2)] border-b border-[var(--color-border)] flex items-center justify-between px-6 shrink-0 relative z-10 box-shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-colors backdrop-blur-2xl backdrop-filter">
            {/* Logo Area */}
            <div className="flex items-center gap-2 text-xl font-mono font-bold text-[var(--color-text-primary)]">
                <span className="text-[var(--color-accent-primary)]">◈</span> GOLDNREC
            </div>

            {/* Center - Data Source Status */}
            <div className="absolute left-1/2 -translate-x-1/2 hidden md:block">
                <LiveSourcePill />
            </div>

            {/* Right Area */}
            <div className="flex items-center gap-4 lg:gap-6">
                <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-[var(--color-text-muted)]">
                    <span>Last run:</span>
                    <span className="text-[var(--color-text-secondary)]">14 mins ago</span>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={toggleTheme}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-border)] hover:border-[var(--color-accent-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-primary)] transition-all"
                        title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                    >
                        {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                    <button className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-border)] hover:border-[var(--color-accent-primary)] transition-colors">
                        <User size={16} className="text-[var(--color-text-secondary)]" />
                    </button>
                </div>
            </div>
        </header>
    );
};

export default TopNavBar;

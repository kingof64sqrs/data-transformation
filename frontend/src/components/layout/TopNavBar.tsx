import React, { useEffect, useState } from 'react';
import { User, Sun, Moon } from 'lucide-react';
import api from '@/api/client';

export const LiveSourcePill = () => {
    const [status, setStatus] = useState<'connected' | 'error' | 'idle'>('connected');
    const [health, setHealth] = useState<{ kafka_connected?: boolean; db2_connected?: boolean }>({});

    useEffect(() => {
        let mounted = true;

        const fetchHealth = () => {
            api.get('/health')
                .then((response) => {
                    if (!mounted) return;
                    setStatus('connected');
                    setHealth({
                        kafka_connected: Boolean(response.data?.kafka_connected),
                        db2_connected: Boolean(response.data?.db2_connected),
                    });
                })
                .catch(() => {
                    if (!mounted) return;
                    setStatus('error');
                    setHealth({ kafka_connected: false, db2_connected: false });
                });
        };

        fetchHealth();
        const interval = setInterval(fetchHealth, 30000);
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    const indicator = (label: string, connected?: boolean) => (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${connected ? 'border-[var(--color-success)]/40 text-[var(--color-success)]' : 'border-[var(--color-danger)]/40 text-[var(--color-danger)]'}`}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[var(--color-success)]' : 'bg-[var(--color-danger)]'}`} />
            {label} {connected ? 'Connected' : 'Down'}
        </span>
    );

    return (
        <div className="flex items-center gap-4 px-4 py-2 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-border)] text-sm font-mono select-none cursor-pointer hover:border-[var(--color-accent-primary)] transition-colors group shadow-sm">
            <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${status === 'connected' ? 'bg-[var(--color-success)] animate-pulse shadow-[0_0_8px_rgba(0,245,160,0.8)]' : 'bg-[var(--color-danger)]'}`}></span>
                <span className={`uppercase font-bold tracking-wider text-[11px] ${status === 'connected' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                    {status === 'connected' ? 'LIVE' : 'DISCONNECTED'}
                </span>
            </div>
            <span className="text-[var(--color-text-muted)] text-lg leading-none">·</span>
            {indicator('Kafka', health.kafka_connected)}
            <span className="text-[var(--color-text-muted)] text-lg leading-none">·</span>
            {indicator('DB2', health.db2_connected)}
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

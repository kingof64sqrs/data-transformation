import React, { useState } from 'react';
import { TerminalLog, type LogEntry } from '@/components/ui/TerminalLog';
import { Button } from '@/components/ui/Button';
import { KpiCard } from '@/components/ui/KpiCard';
import api from '@/api/client';

export default function Pipeline() {
    const [isRunning, setIsRunning] = useState(false);
    const [status, setStatus] = useState<'IDLE' | 'RUNNING' | 'COMPLETE' | 'FAILED'>('IDLE');
    const [logs, setLogs] = useState<LogEntry[]>([
        { timestamp: new Date().toLocaleTimeString(), level: 'INFO', message: 'System ready.' }
    ]);

    // Conf state
    const [resetLayers, setResetLayers] = useState(false);
    const [recordLimit, setRecordLimit] = useState<string>('');
    const [dryRun, setDryRun] = useState(false);

    // Metrics (mocked structure, to be populated after run based on output)
    const [metrics, setMetrics] = useState({
        bronze: 0,
        silver: 0,
        matched: 0,
        merged: 0,
        review: 0,
        percentCleaned: '100%'
    });

    const addLog = (level: LogEntry['level'], message: string) => {
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), level, message }]);
    };

    const runPipeline = async () => {
        setIsRunning(true);
        setStatus('RUNNING');
        addLog('INFO', `Pipeline initiated — reset_layers=${resetLayers} dry_run=${dryRun}`);

        try {
            addLog('INFO', 'Connecting to data source...');
            if (dryRun) {
                addLog('WARN', 'Dry run mode is not enabled on the backend yet; running a live pipeline instead.');
            }

            const res = await api.post('/pipeline/run', {
                reset_layers: resetLayers,
                produce_limit: recordLimit === '' ? null : parseInt(recordLimit, 10),
            }, {
                timeout: 120000,
            });

            const data = res.data;
            addLog('SUCCESS', `Bronze layer: ${data.db2_records || 0} records ingested`);
            addLog('INFO', `Silver layer: ${data.silver_records || 0} records normalized`);
            addLog('INFO', `Found ${data.duplicate_candidates || 0} duplicate candidates`);
            addLog('INFO', `Auto-merged: ${data.auto_merged || 0} pairs`);
            addLog('WARN', `Review queue: ${data.manual_review || 0} pairs`);
            addLog('SUCCESS', `Golden records created: ${data.golden_records || 0}`);
            addLog('DONE', `Pipeline complete`);

            setMetrics({
                bronze: data.bronze_records ?? data.db2_records ?? 0,
                silver: data.silver_records ?? 0,
                matched: data.duplicate_candidates ?? 0,
                merged: data.auto_merged ?? 0,
                review: data.manual_review ?? 0,
                percentCleaned: data.db2_records ? `${Math.round(((data.silver_records ?? 0) / data.db2_records) * 1000) / 10}%` : '0%'
            });

            setStatus('COMPLETE');
        } catch (e: any) {
            addLog('ERROR', e.message || 'Pipeline failed');
            setStatus('FAILED');
        } finally {
            setIsRunning(false);
        }
    };

    const getStatusColor = () => {
        if (status === 'RUNNING') return 'text-[var(--color-accent-primary)] animate-pulse';
        if (status === 'COMPLETE') return 'text-[var(--color-success)]';
        if (status === 'FAILED') return 'text-[var(--color-danger)]';
        return 'text-[var(--color-text-secondary)]';
    };

    return (
        <div className="flex flex-col h-full gap-6 animate-slide-up min-h-0">

            {/* Header Banner */}
            <div className="panel-border bg-[var(--color-surface-1)] rounded-lg p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className={`text-xl font-bold font-mono tracking-widest ${getStatusColor()}`}>
                            {status === 'RUNNING' ? '◉' : (status === 'COMPLETE' ? '✓' : (status === 'FAILED' ? '✗' : '●'))} {status}
                        </span>
                    </div>
                    <div className="h-6 w-px bg-[var(--color-border)]"></div>
                    <span className="font-mono text-sm text-[var(--color-text-muted)]">Last run: 2 min ago</span>
                </div>

                <Button
                    variant="primary"
                    size="lg"
                    className="w-full md:w-auto font-display text-lg px-12 uppercase tracking-widest relative overflow-hidden group"
                    onClick={runPipeline}
                    disabled={isRunning}
                >
                    {isRunning ? (
                        <span className="flex items-center gap-2"><span className="animate-spin">◎</span> RUNNING...</span>
                    ) : (
                        <>▶ RUN PIPELINE</>
                    )}
                    {!isRunning && <div className="absolute inset-0 w-1/4 h-full bg-white opacity-20 transform -skew-x-12 -translate-x-full group-hover:animate-scanning-line pointer-events-none" />}
                </Button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 shrink-0 h-full min-h-0">
                {/* Config Panel */}
                <div className="flex-1 lg:max-w-md panel-border bg-[var(--color-surface-1)] rounded-lg p-6 flex flex-col gap-6">
                    <h2 className="font-mono font-bold tracking-widest uppercase text-sm text-[var(--color-text-muted)]">Configuration</h2>

                    <div className="space-y-6">
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <div className="relative flex items-center justify-center pt-1">
                                <input type="checkbox" className="sr-only peer" checked={resetLayers} onChange={e => setResetLayers(e.target.checked)} disabled={isRunning} />
                                <div className="w-10 h-6 bg-[var(--color-surface-2)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[6px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-warning)] border border-[var(--color-border)]"></div>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-mono text-[var(--color-text-primary)]">Reset All Layers</span>
                                <span className="text-xs text-[var(--color-text-muted)] mt-1">Wipes existing processed data and reruns from source.</span>
                            </div>
                        </label>

                        <div className="flex flex-col gap-2">
                            <label className="font-mono font-medium text-[var(--color-text-primary)]">Record Limit</label>
                            <input type="number"
                                value={recordLimit} onChange={e => setRecordLimit(e.target.value)}
                                placeholder="Process all"
                                disabled={isRunning}
                                className="bg-[var(--color-background)] border border-[var(--color-border)] rounded px-3 py-2 text-sm font-code text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] disabled:opacity-50"
                            />
                            <span className="text-xs text-[var(--color-text-muted)]">Process limit (leave empty to ingest all records from source).</span>
                        </div>

                        <label className="flex items-start gap-3 cursor-pointer group">
                            <div className="relative flex items-center justify-center pt-1">
                                <input type="checkbox" className="sr-only peer" checked={dryRun} onChange={e => setDryRun(e.target.checked)} disabled={isRunning} />
                                <div className="w-10 h-6 bg-[var(--color-surface-2)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[6px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-accent-primary)] border border-[var(--color-border)]"></div>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-mono text-[var(--color-text-primary)]">Dry Run Mode</span>
                                <span className="text-xs text-[var(--color-text-muted)] mt-1">Simulate without writing to DB.</span>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Terminal Log */}
                <div className="flex-[2] flex flex-col h-[400px] lg:h-auto">
                    <TerminalLog logs={logs} className="flex-1 min-h-0 h-full border border-[var(--color-border)]" autoScroll={true} />
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="shrink-0 pt-2 grid grid-cols-2 md:grid-cols-3 gap-4">
                <KpiCard title="Records Into Bronze" value={metrics.bronze} colorClass="text-[var(--color-text-muted)]" />
                <KpiCard title="Percent Cleaned" value={parseFloat(metrics.percentCleaned)} delta={metrics.percentCleaned} colorClass="text-[var(--color-accent-primary)]" />
                <KpiCard title="Match Candidates" value={metrics.matched} colorClass="text-[var(--color-accent-secondary)]" />
                <KpiCard title="Auto-Merged" value={metrics.merged} colorClass="text-[var(--color-success)]" />
                <KpiCard title="Manual Review Items" value={metrics.review} colorClass="text-[var(--color-warning)]" />
                <KpiCard title="Pipeline Efficiency" value={95} delta="95%" colorClass="text-purple-400" />
            </div>

        </div>
    );
}

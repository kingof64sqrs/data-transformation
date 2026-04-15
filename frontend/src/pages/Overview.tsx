import React, { useEffect, useState } from 'react';
import { KpiCard } from '@/components/ui/KpiCard';
import { PipelineFlow, type PipelineStage } from '@/components/ui/PipelineFlow';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import api from '@/api/client';

const mockActivityFeed = [
    { id: 1, text: "Auto-merged [ID:4821] → [ID:4822] conf: 97%", time: "00:02 ago", dot: "bg-[var(--color-success)]" },
    { id: 2, text: "Flagged for review [ID:1103] ↔ [ID:2204] conf: 81%", time: "00:15 ago", dot: "bg-[var(--color-warning)]" },
    { id: 3, text: "Pipeline run complete 1,200 records processed", time: "01:32 ago", dot: "bg-[var(--color-accent-primary)]" },
    { id: 4, text: "Data source connected kafka@localhost:9092", time: "10:00 ago", dot: "bg-[var(--color-text-muted)]" },
];

const mockDistData = [
    { bucket: '< 75%', count: 120, fill: 'var(--color-text-muted)' },
    { bucket: '75-89%', count: 213, fill: 'var(--color-warning)' },
    { bucket: '90-100%', count: 634, fill: 'var(--color-success)' }
];

const mockDonutData = [
    { name: 'Auto-Merged', value: 634, fill: 'var(--color-success)' },
    { name: 'Manual Review', value: 213, fill: 'var(--color-warning)' },
    { name: 'Kept Separate', value: 0, fill: 'var(--color-text-muted)' },
];

export default function Overview() {
    const [summary, setSummary] = useState<any>(null);

    const toNumber = (value: unknown, fallback = 0) => Number(value ?? fallback);

    useEffect(() => {
        api.get('/summary').then(res => setSummary(res.data)).catch(console.error);
    }, []);

    const kpis = summary ? [
        { title: 'db2_records', value: toNumber(summary.db2_records, 0), colorClass: 'text-[var(--color-text-muted)] border-l-4 border-l-[var(--color-border)]' },
        { title: 'silver_records', value: toNumber(summary.silver_records, 0), colorClass: 'text-[var(--color-accent-primary)] border-l-4 border-l-[var(--color-accent-primary)]' },
        { title: 'golden_records', value: toNumber(summary.golden_records, 0), colorClass: 'text-[var(--color-success)] border-l-4 border-l-[var(--color-success)]' },
        { title: 'manual_review', value: toNumber(summary.manual_review, summary.review_queue ?? 0), colorClass: 'text-[var(--color-warning)] border-l-4 border-l-[var(--color-warning)]', delta: '+0 today' },
        { title: 'auto_merged', value: toNumber(summary.auto_merged, 0), colorClass: 'text-[var(--color-accent-secondary)] border-l-4 border-l-[var(--color-accent-secondary)]', delta: '+0 today' },
    ] : [];

    const pipelineStages: PipelineStage[] = summary ? [
        { id: 'src', label: 'SOURCE', count: toNumber(summary.db2_records, 0), status: 'healthy', icon: 'source' },
        { id: 'brz', label: 'BRONZE', count: toNumber(summary.bronze_records, toNumber(summary.db2_records, 0)), status: 'healthy', icon: 'bronze' },
        { id: 'slv', label: 'SILVER', count: toNumber(summary.silver_records, 0), status: 'healthy', icon: 'silver' },
        { id: 'mtch', label: 'MATCHING', count: toNumber(summary.duplicate_candidates, summary.duplicate_matches ?? 0), status: 'healthy', icon: 'matching' },
        { id: 'gld', label: 'GOLD', count: toNumber(summary.golden_records, 0), status: 'healthy', icon: 'gold' }
    ] : [];

    return (
        <div className="space-y-6 animate-slide-up flex flex-col min-h-0 h-full">

            {/* Zone 1: KPI Strip */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 shrink-0">
                {kpis.map((kpi, idx) => (
                    <KpiCard key={idx} {...kpi} />
                ))}
                {!summary && Array(5).fill(0).map((_, i) => (
                    <div key={i} className="panel-border bg-[var(--color-surface-1)] rounded-lg min-h-[110px] animate-pulse"></div>
                ))}
            </div>

            {/* Zone 2 & 3: Flow & Feed */}
            <div className="flex flex-col lg:flex-row gap-6 shrink-0 z-10">

                <div className="flex-[3] panel-border bg-[var(--color-surface-1)] rounded-lg p-6 flex flex-col justify-center">
                    {pipelineStages.length > 0 && <PipelineFlow stages={pipelineStages} />}
                </div>

                <div className="flex-[2] panel-border bg-[var(--color-surface-1)] rounded-lg p-6 flex flex-col gap-4 overflow-hidden h-[264px]">
                    <h3 className="font-mono text-sm tracking-widest text-[var(--color-text-muted)] uppercase">Live Activity</h3>
                    <div className="space-y-3 overflow-y-auto">
                        {mockActivityFeed.map((item, i) => (
                            <div key={item.id} className="flex gap-3 text-sm animate-flow-in" style={{ animationDelay: `${i * 100}ms` }}>
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 shadow-[0_0_8px_currentColor] ${item.dot}`}></span>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[var(--color-text-muted)] font-mono text-xs">{item.time}</span>
                                    <span className="text-[var(--color-text-primary)] font-code tracking-wide">{item.text}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {/* Zone 4 & 5: Charts */}
            <div className="flex flex-col lg:flex-row gap-6 shrink-0 min-h-[300px]">
                {/* Data Layer Table placeholder (40%) */}
                <div className="flex-[2] panel-border bg-[var(--color-surface-1)] rounded-lg p-6 flex flex-col">
                    <h3 className="font-mono text-sm tracking-widest text-[var(--color-text-muted)] uppercase mb-4">Top Merged Records</h3>
                    <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)] italic font-mono text-sm border border-[var(--color-border)] border-dashed rounded bg-[var(--color-surface-2)]/30">
                        Preview of records merged with highest confidence...
                    </div>
                </div>

                {/* Match Score Dist (30%) */}
                <div className="flex-[1.5] panel-border bg-[var(--color-surface-1)] rounded-lg p-6 flex flex-col min-h-[320px]">
                    <h3 className="font-mono text-sm tracking-widest text-[var(--color-text-muted)] uppercase mb-6">Score Distribution</h3>
                    <div className="flex-1 min-h-[240px] relative -ml-4">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                            <BarChart data={mockDistData} layout="vertical" margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="bucket" type="category" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }} width={70} />
                                <RechartsTooltip cursor={{ fill: 'var(--color-surface-2)' }} contentStyle={{ backgroundColor: 'var(--color-surface-1)', borderColor: 'var(--color-border)', borderRadius: '4px', color: 'white' }} />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                    {mockDistData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Decisions Donut (30%) */}
                <div className="flex-[1.5] panel-border bg-[var(--color-surface-1)] rounded-lg p-6 relative flex flex-col items-center min-h-[320px]">
                    <h3 className="font-mono text-sm tracking-widest text-[var(--color-text-muted)] uppercase self-start w-full">Decision Split</h3>
                    <div className="flex-1 w-full relative -mt-4 min-h-[240px]">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                            <PieChart>
                                <Pie
                                    data={mockDonutData}
                                    innerRadius="65%"
                                    outerRadius="85%"
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="transparent"
                                >
                                    {mockDonutData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Pie>
                                <RechartsTooltip contentStyle={{ backgroundColor: 'var(--color-surface-1)', borderColor: 'var(--color-border)', borderRadius: '4px', color: 'white' }} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-2">
                            <span className="text-3xl font-display font-bold">{summary ? summary.duplicate_candidates : '...'}</span>
                            <span className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase tracking-widest mt-1">Candidates</span>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
}

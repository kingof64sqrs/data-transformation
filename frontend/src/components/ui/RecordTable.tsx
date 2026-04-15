import React from 'react';
import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp } from 'lucide-react';

export interface Column<T> {
    key: string;
    header: string;
    render?: (row: T) => React.ReactNode;
    sortable?: boolean;
}

interface RecordTableProps<T> {
    columns: Column<T>[];
    data: T[];
    onRowClick?: (row: T) => void;
    sortKey?: string;
    sortDir?: 'asc' | 'desc';
    onSort?: (key: string) => void;
    className?: string;
}

export function RecordTable<T extends { id: string | number }>({
    columns,
    data,
    onRowClick,
    sortKey,
    sortDir,
    onSort,
    className
}: RecordTableProps<T>) {
    return (
        <div className={cn("w-full overflow-x-auto border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-1)]", className)}>
            <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] sticky top-0 z-10 border-b border-[var(--color-border)] uppercase tracking-wider text-xs font-mono font-medium">
                    <tr>
                        {columns.map(col => (
                            <th
                                key={col.key}
                                className={cn(
                                    "px-4 py-3 first:pl-6 last:pr-6 transition-colors",
                                    col.sortable && "cursor-pointer hover:text-[var(--color-text-primary)]"
                                )}
                                onClick={() => col.sortable && onSort?.(col.key)}
                            >
                                <div className="flex items-center gap-2">
                                    {col.header}
                                    {col.sortable && sortKey === col.key && (
                                        <span className="text-[var(--color-accent-primary)]">
                                            {sortDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                                        </span>
                                    )}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                    {data.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} className="px-6 py-8 text-center text-[var(--color-text-muted)] italic">
                                No records found.
                            </td>
                        </tr>
                    ) : (
                        data.map((row, idx) => (
                            <tr
                                key={row.id}
                                onClick={() => onRowClick?.(row)}
                                className={cn(
                                    "group transition-colors",
                                    idx % 2 === 0 ? "bg-transparent" : "bg-[var(--color-surface-2)]/30",
                                    onRowClick && "cursor-pointer hover:bg-[var(--color-surface-2)] hover:border-l-[2px] hover:border-l-[var(--color-accent-primary)] hover:pl-[-2px]" // hover border simulation
                                )}
                            >
                                {columns.map((col, i) => (
                                    <td key={col.key} className={cn("px-4 py-3 first:pl-6 last:pr-6 text-[var(--color-text-primary)]", i === 0 && "group-hover:text-[var(--color-accent-primary)] transition-colors")}>
                                        {col.render ? col.render(row) : (row as any)[col.key]}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}

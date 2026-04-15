import React, { useEffect, useState } from 'react';
import { RecordTable, type Column } from '@/components/ui/RecordTable';
import { SidePanel } from '@/components/ui/SidePanel';
import api from '@/api/client';
import { Search, Download, Filter } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type Layer = 'db2' | 'bronze' | 'silver' | 'gold';

const toText = (value: unknown) => (value === null || value === undefined || value === '' ? '-' : String(value));

const getDisplayName = (row: any) => {
    if (row?.full_name) return row.full_name;
    if (row?.name) return row.name;
    const firstName = row?.first_name || row?.first_nm || '';
    const lastName = row?.last_name || row?.last_nm || '';
    return `${firstName} ${lastName}`.trim() || '-';
};

const getEmail = (row: any) => row?.email || row?.email_primary || row?.email_addr || '-';
const getPhone = (row: any) => row?.phone_number || row?.phone || row?.phone_num || '-';
const getId = (row: any) => row?.customer_id || row?.golden_id || row?.id || row?.cust_id || '-';
const getSourceCount = (row: any) => {
    const sourceIds = row?.source_record_ids || row?.source_ids;
    if (!sourceIds) return 0;
    if (Array.isArray(sourceIds)) return sourceIds.filter(Boolean).length;
    if (typeof sourceIds === 'string') {
        try {
            const parsed = JSON.parse(sourceIds);
            if (Array.isArray(parsed)) return parsed.filter(Boolean).length;
        } catch {
            return sourceIds.split(',').filter(Boolean).length;
        }
    }
    return 1;
};

const normalizeLayerRow = (row: any, layer: Layer) => {
    if (layer === 'gold') {
        return {
            ...row,
            id: row.id ?? row.golden_id,
            golden_id: row.golden_id ?? row.id,
            customer_id: row.customer_id ?? row.golden_id,
            first_name: row.first_name ?? '',
            last_name: row.last_name ?? '',
            full_name: row.full_name ?? getDisplayName(row),
            email: row.email ?? row.email_primary,
            phone_number: row.phone_number ?? row.phone,
            date_of_birth: row.date_of_birth ?? row.birth_date,
            address_line1: row.address_line1 ?? row.address,
            source_record_ids: row.source_record_ids ?? row.source_ids,
        };
    }

    if (layer === 'silver') {
        return {
            ...row,
            id: row.id ?? row.silver_id,
            customer_id: row.customer_id ?? row.cust_id,
            first_name: row.first_name ?? '',
            last_name: row.last_name ?? '',
            full_name: row.full_name ?? getDisplayName(row),
            email: row.email,
            phone_number: row.phone_number ?? row.phone,
            date_of_birth: row.date_of_birth ?? row.birth_date,
            address_line1: row.address_line1 ?? row.address,
        };
    }

    return {
        ...row,
        id: row.id ?? row.customer_id ?? row.bronze_id,
        customer_id: row.customer_id ?? row.cust_id,
        first_name: row.first_name ?? row.first_nm ?? '',
        last_name: row.last_name ?? row.last_nm ?? '',
        email: row.email ?? row.email_addr,
        phone_number: row.phone_number ?? row.phone_num,
        date_of_birth: row.date_of_birth ?? row.birth_dt,
        address_line1: row.address_line1 ?? row.addr_line1,
        city: row.city ?? row.addr_city,
        state: row.state ?? row.addr_state,
    };
};

export default function Records() {
    const [activeLayer, setActiveLayer] = useState<Layer>('db2');
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

    useEffect(() => {
        setLoading(true);
        setSelectedRecord(null);
        api.get(`/records/${activeLayer}?limit=100`)
            .then(res => {
                const rows = res.data.records || res.data.queue || res.data.matches || res.data || [];
                setData(rows.map((row: any) => normalizeLayerRow(row, activeLayer)));
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [activeLayer]);

    const layers: { id: Layer, label: string }[] = [
        { id: 'db2', label: 'Raw (DB2)' },
        { id: 'bronze', label: 'Bronze' },
        { id: 'silver', label: 'Silver' },
        { id: 'gold', label: 'Gold ✨' },
    ];

    const getColumns = (): Column<any>[] => {
        if (activeLayer === 'gold') {
            return [
                { key: 'golden_id', header: 'Record ID', render: (r) => toText(r.golden_id) },
                { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-white">{getDisplayName(r)}</span> },
                { key: 'email', header: 'Email', render: (r) => toText(getEmail(r)) },
                { key: 'phone_number', header: 'Phone', render: (r) => toText(getPhone(r)) },
                { key: 'city', header: 'City', render: (r) => toText(r.city) },
                { key: 'source_record_ids', header: 'Source Records', render: (r) => <span className="bg-[var(--color-surface-2)] border border-[var(--color-border)] px-2 py-0.5 rounded text-xs">⊕ {getSourceCount(r)} merged</span> },
            ];
        }

        if (activeLayer === 'silver') {
            return [
                { key: 'customer_id', header: 'ID', render: (r) => toText(getId(r)) },
                { key: 'first_name', header: 'First Name', render: (r) => toText(r.first_name) },
                { key: 'last_name', header: 'Last Name', render: (r) => toText(r.last_name) },
                { key: 'email', header: 'Email', render: (r) => toText(getEmail(r)) },
                { key: 'phone_number', header: 'Phone', render: (r) => toText(getPhone(r)) },
                { key: 'city', header: 'City', render: (r) => toText(r.city) },
                { key: 'completeness', header: 'Completeness', render: (r) => `${Math.round(Number(r.completeness || 0))}%` },
            ];
        }

        return [
            { key: 'customer_id', header: 'ID', render: (r) => toText(getId(r)) },
            { key: 'first_name', header: 'First Name', render: (r) => toText(r.first_name || r.first_nm) },
            { key: 'last_name', header: 'Last Name', render: (r) => toText(r.last_name || r.last_nm) },
            { key: 'email', header: 'Email', render: (r) => toText(getEmail(r)) },
            { key: 'phone_number', header: 'Phone', render: (r) => toText(getPhone(r)) },
            { key: 'city', header: 'City', render: (r) => toText(r.city) },
            { key: 'zip_code', header: 'Zip Code', render: (r) => toText(r.zip_code) },
        ];
    };

    return (
        <div className="flex flex-col h-full gap-4 animate-slide-up">
            <div className="flex flex-col gap-4 shrink-0">
                <div className="flex border-b border-[var(--color-border)]">
                    {layers.map(layer => (
                        <button
                            key={layer.id}
                            onClick={() => setActiveLayer(layer.id)}
                            className={`px-6 py-3 font-mono text-sm tracking-wide transition-colors relative ${activeLayer === layer.id ? 'text-[var(--color-accent-primary)] font-bold' : 'text-[var(--color-text-secondary)] hover:text-white'}`}
                        >
                            {layer.label}
                            {activeLayer === layer.id && (
                                <div className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-[var(--color-accent-primary)]" style={{ boxShadow: '0 -2px 10px var(--color-accent-primary)' }} />
                            )}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={18} />
                        <input
                            type="text"
                            placeholder="Search by name, email, phone, ID..."
                            className="w-full bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-md pl-10 pr-4 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] transition-all"
                        />
                    </div>
                    <Button variant="secondary" className="gap-2 shrink-0">
                        <Filter size={16} /> Filters
                    </Button>
                    <Button variant="ghost" className="hidden md:flex gap-2 border border-[var(--color-border)] shrink-0">
                        <Download size={16} /> Export CSV
                    </Button>
                </div>
            </div>

            <div className="flex-1 min-h-0 relative">
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent-primary)]"></div>
                    </div>
                ) : (
                    <RecordTable
                        columns={getColumns()}
                        data={data}
                        onRowClick={(row) => setSelectedRecord(row)}
                        className="h-full overflow-auto"
                    />
                )}
            </div>

            <SidePanel
                isOpen={!!selectedRecord}
                onClose={() => setSelectedRecord(null)}
                title={
                    <div className="flex flex-col gap-1">
                        <span className="font-mono text-sm text-[var(--color-text-muted)]">#{getId(selectedRecord)}</span>
                        <span className="text-2xl font-bold font-sans text-white">{getDisplayName(selectedRecord)}</span>
                        <span className="text-xs uppercase bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] w-fit px-2 py-0.5 rounded border border-[var(--color-accent-primary)]/30 mt-2">{activeLayer} Record</span>
                    </div>
                }
            >
                {selectedRecord && (
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <h4 className="text-xs font-mono text-[var(--color-text-muted)] tracking-widest uppercase border-b border-[var(--color-border)] pb-2">Identity</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase">Date of Birth</div>
                                    <div className="text-sm">{toText(selectedRecord.date_of_birth)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase">Completeness</div>
                                    <div className="text-sm">{selectedRecord.completeness !== undefined ? `${Math.round(Number(selectedRecord.completeness))}%` : '-'}</div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h4 className="text-xs font-mono text-[var(--color-text-muted)] tracking-widest uppercase border-b border-[var(--color-border)] pb-2">Contact</h4>
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <div className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase">Email</div>
                                    <div className="text-sm">{toText(getEmail(selectedRecord))}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase">Phone</div>
                                    <div className="text-sm">{toText(getPhone(selectedRecord))}</div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h4 className="text-xs font-mono text-[var(--color-text-muted)] tracking-widest uppercase border-b border-[var(--color-border)] pb-2">Address</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <div className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase">Street</div>
                                    <div className="text-sm">{toText(selectedRecord.address_line1)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase">City</div>
                                    <div className="text-sm">{toText(selectedRecord.city)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase">Zip Code</div>
                                    <div className="text-sm">{toText(selectedRecord.zip_code)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase">State / Country</div>
                                    <div className="text-sm">{toText(selectedRecord.state)} {toText(selectedRecord.country)}</div>
                                </div>
                            </div>
                        </div>

                        {activeLayer === 'gold' && selectedRecord.source_record_ids && (
                            <div className="space-y-3">
                                <h4 className="text-xs font-mono text-[var(--color-text-muted)] tracking-widest uppercase border-b border-[var(--color-border)] pb-2 flex items-center justify-between">
                                    <span>Source Records</span>
                                    <span className="bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded text-[var(--color-text-primary)]">{getSourceCount(selectedRecord)}</span>
                                </h4>
                                <div className="flex flex-col gap-2">
                                    {(Array.isArray(selectedRecord.source_record_ids) ? selectedRecord.source_record_ids : String(selectedRecord.source_record_ids).replace(/^\[|\]$/g, '').split(',')).map((id: string) => {
                                        const cleaned = id.replace(/^[\"' ]+|[\"' ]+$/g, '').trim();
                                        if (!cleaned) return null;
                                        return (
                                            <div key={cleaned} className="bg-[var(--color-surface-2)]/50 border border-[var(--color-border)] rounded p-2 text-sm font-mono flex items-center gap-2 text-[var(--color-text-secondary)]">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]"></div>
                                                ID: {cleaned}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="pt-4 mt-6 border-t border-[var(--color-border)] flex justify-center">
                            <Button variant="ghost" className="w-full font-mono text-xs">Toggle Raw JSON {`{}`}</Button>
                        </div>
                    </div>
                )}
            </SidePanel>
        </div>
    );
}

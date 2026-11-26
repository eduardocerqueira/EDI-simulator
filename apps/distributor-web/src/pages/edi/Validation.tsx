import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { cn } from '@edi/ui/lib/utils';
import { api, qs, type Page } from '@/lib/api';
import { useUrlFilters, usePartners } from '@/lib/hooks';
import type { X12Issue } from '@/lib/types';
import { ErrorState, LoadingRows, NativeSelect, PageHeader, Pagination, RangeSelect } from '@/components/common';
import { FilterBar } from '@/components/FilterBar';
import { DonutChart } from '@/components/charts';
import { AckCodeBadge, IssuesTable, LevelBadge } from '@/components/x12/IssuesTable';

const LEVELS = ['INTERCHANGE', 'GROUP', 'TRANSACTION', 'SEGMENT', 'ELEMENT', 'BUSINESS'];
const LEVEL_HELP: Record<string, string> = {
  INTERCHANGE: 'ISA/IEA envelope → TA1 rejects the whole file',
  GROUP: 'GS/GE → 997 AK9',
  TRANSACTION: 'ST/SE → 997 AK5',
  SEGMENT: 'Segment structure → 997 AK3',
  ELEMENT: 'Element data → 997 AK4',
  BUSINESS: 'Valid X12, wrong business data → distributor rejects',
};

interface Summary {
  byCode: Array<{ code: string; level: string; x12Code: string | null; x12CodeSource: string; x12CodeDescription?: string; count: number }>;
  byLevel: Array<{ level: string; count: number }>;
}

export function ValidationPage() {
  const [hours, setHours] = useState(168);
  const { values: f, page, set } = useUrlFilters({ level: '', code: '', partnerId: '' });
  const partners = usePartners();
  const summary = useQuery({ queryKey: ['issues-summary', hours], queryFn: () => api<Summary>(`/issues/summary?hours=${hours}`), refetchInterval: 10000 });
  const list = useQuery({
    queryKey: ['issues', f, page],
    queryFn: () => api<Page<X12Issue & { interchange: any; transaction: any }>>(`/issues${qs({ ...f, page, pageSize: 25 })}`),
    refetchInterval: 10000,
    placeholderData: keepPreviousData,
  });
  const levels = LEVELS.map((l) => ({ level: l, count: summary.data?.byLevel.find((x) => x.level === l)?.count ?? 0 }));

  return (
    <>
      <PageHeader
        title="Validation"
        description="Every problem found while validating inbound X12, from the envelope down to single elements, plus business rules. Each X12-level error maps to the code reported back in the TA1 or 997."
        actions={<RangeSelect value={hours} onChange={setHours} options={[[24, '24h'], [168, '7d'], [720, '30d']]} />}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Issues by level</CardTitle>
            <CardDescription>Where in the envelope errors happen</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={levels.filter((l) => l.count > 0)}
              nameKey="level"
              valueKey="count"
              center={{ value: levels.reduce((n, l) => n + l.count, 0).toLocaleString(), label: 'issues' }}
            />
          </CardContent>
        </Card>
        <Card className="gap-3 lg:col-span-2">
          <CardHeader>
            <CardTitle>Error codes</CardTitle>
            <CardDescription>Click a row to filter the list below</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[340px] overflow-y-auto px-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Reported as</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary.data?.byCode ?? []).map((c) => (
                  <TableRow key={`${c.code}-${c.level}-${c.x12Code}`} className={cn('cursor-pointer', f.code === c.code && 'bg-accent')} onClick={() => set({ code: f.code === c.code ? '' : c.code })}>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell><LevelBadge level={c.level} /></TableCell>
                    <TableCell>
                      <AckCodeBadge source={c.x12CodeSource} code={c.x12Code} description={c.x12CodeDescription} />
                      {c.x12CodeDescription && <span className="text-muted-foreground ml-2 text-xs">{c.x12CodeDescription}</span>}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{c.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {levels.map((l) => (
          <button
            key={l.level}
            onClick={() => set({ level: f.level === l.level ? '' : l.level })}
            className={cn('hover:bg-muted/60 cursor-pointer rounded-none border p-3 text-left transition-colors', f.level === l.level && 'border-primary bg-accent')}
          >
            <div className="flex items-center justify-between">
              <LevelBadge level={l.level} />
              <span className="font-semibold tabular-nums">{l.count}</span>
            </div>
            <div className="text-muted-foreground mt-1.5 text-xs">{LEVEL_HELP[l.level]}</div>
          </button>
        ))}
      </div>
      <Card className="mt-4 gap-0 py-0">
        <FilterBar onReset={() => set({ level: '', code: '', partnerId: '' })}>
          <NativeSelect value={f.level} onChange={(v) => set({ level: v })} placeholder="All levels" options={LEVELS.map((l) => ({ value: l, label: l.toLowerCase() }))} />
          <NativeSelect value={f.code} onChange={(v) => set({ code: v })} placeholder="All codes" options={(summary.data?.byCode ?? []).map((c) => ({ value: c.code, label: c.code })).filter((o, i, a) => a.findIndex((x) => x.value === o.value) === i)} />
          <NativeSelect value={f.partnerId} onChange={(v) => set({ partnerId: v })} placeholder="All producers" options={(partners.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
        </FilterBar>
        {list.isLoading ? <LoadingRows /> : list.error ? <div className="p-4"><ErrorState error={list.error} /></div> : <IssuesTable issues={list.data!.items} showContext />}
        {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => set({ page: p })} />}
      </Card>
    </>
  );
}

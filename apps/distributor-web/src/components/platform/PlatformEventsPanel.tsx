import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { RefreshCcw } from '@edi/ui/icons';
import { Card, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { ErrorState, LoadingRows, NativeSelect, Pagination } from '@/components/common';
import { FilterBar } from '@/components/FilterBar';
import { EventTimeline } from '@/components/platform/EventTimeline';
import { api, qs, type Page } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useUrlFilters } from '@/lib/hooks';
import { EVENT_META } from '@/lib/platform';
import type { ClusterEvent } from '@/lib/types';

const PAGE_SIZE = 20;
const SEVERITIES = ['ERROR', 'WARNING', 'INFO'];

type EventsPage = Page<ClusterEvent> & { retained: number; maxRetained: number; oldest?: string; nodes: string[] };

/** Recovery timeline with server-side filters and pagination (controller keeps the last MAX_EVENTS events). */
export function PlatformEventsPanel() {
  const { values: f, page, set } = useUrlFilters({ node: '', type: '', severity: '', q: '' });
  const params = { ...f, page, pageSize: PAGE_SIZE };
  const q = useQuery({
    queryKey: ['platform', 'events', params],
    queryFn: () => api<EventsPage>(`/platform/events${qs(params)}`),
    refetchInterval: 3000,
    placeholderData: keepPreviousData,
  });
  const filtered = !!(f.node || f.type || f.severity || f.q);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2">
          <RefreshCcw className="size-4" /> Recovery timeline
        </CardTitle>
        <CardDescription>
          Platform controller events, newest first: probes failing, nodes declared down, replacements and recoveries.
          {q.data && (
            <>
              {' '}
              Keeps the last {fmt.num(q.data.maxRetained)} events ({fmt.num(q.data.retained)} now{q.data.oldest ? `, oldest ${fmt.ago(q.data.oldest)}` : ''}).
            </>
          )}
        </CardDescription>
      </CardHeader>
      <FilterBar search={f.q} onSearch={(v) => set({ q: v })} placeholder="Search messages" onReset={filtered ? () => set({ node: '', type: '', severity: '', q: '' }) : undefined}>
        <NativeSelect value={f.node} onChange={(v) => set({ node: v })} placeholder="All nodes" options={(q.data?.nodes ?? []).map((n) => ({ value: n, label: n }))} />
        <NativeSelect
          value={f.type}
          onChange={(v) => set({ type: v })}
          placeholder="All event types"
          options={Object.entries(EVENT_META).map(([value, m]) => ({ value, label: m.label }))}
        />
        <NativeSelect value={f.severity} onChange={(v) => set({ severity: v })} placeholder="Any severity" options={SEVERITIES.map((s) => ({ value: s, label: s.toLowerCase() }))} />
      </FilterBar>
      <div className="px-6 py-4">
        {q.isLoading ? <LoadingRows /> : q.error ? <ErrorState error={q.error} /> : <EventTimeline events={q.data!.items} limit={PAGE_SIZE} />}
      </div>
      {q.data && q.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={(p) => set({ page: p })} />}
    </Card>
  );
}

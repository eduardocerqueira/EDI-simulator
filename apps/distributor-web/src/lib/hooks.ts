import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from './api';
import type { PartnerRef } from './types';

/** Filters synced to the URL query string so links are shareable. */
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(Object.entries(defaults).map(([k, d]) => [k, params.get(k) ?? d])) as T;
  const page = Number(params.get('page') ?? 1) || 1;
  const set = (patch: Partial<T> & { page?: number }) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || v === 'all' || (k === 'page' && v === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  return { values, page, set };
}

export function usePartners() {
  return useQuery({ queryKey: ['partners-lite'], queryFn: () => api<Array<PartnerRef & { code: string }>>('/partners'), staleTime: 60_000 });
}

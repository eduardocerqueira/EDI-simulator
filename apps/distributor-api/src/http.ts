import type { FastifyRequest } from 'fastify';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function paging(req: FastifyRequest) {
  const q = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(q.page ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize ?? 25) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export const q = (req: FastifyRequest) => req.query as Record<string, string | undefined>;

export function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600_000);
}

export function rangeFrom(req: FastifyRequest, defHours = 24) {
  const hours = Math.min(24 * 90, Math.max(1, Number(q(req).hours ?? defHours) || defHours));
  return { hours, from: hoursAgo(hours), to: new Date() };
}

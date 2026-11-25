const TOKEN_KEY = 'hh_token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set('authorization', `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path.startsWith('/api') ? path : `/api${path}`, { ...init, headers, body });
  if (res.status === 401 && !path.includes('/auth/login')) {
    tokenStore.clear();
    if (!location.pathname.startsWith('/login')) location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    throw new ApiError(401, 'Unauthorized');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** Build a query string from an object, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== 'all') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

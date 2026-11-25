const TOKEN_KEY = 'hm_token';

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

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`/api${path}`, { ...init, headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) {
      tokenStore.clear();
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}

// ---------------- Types (mirror apps/order-api) ----------------

export interface Customer {
  id: string;
  email: string;
  name: string;
  company: string | null;
  createdAt: string;
}

export interface Product {
  id: string;
  upc: string;
  sku: string;
  name: string;
  category: string;
  uom: string;
  producerCode: string;
  producerName: string;
  price: number;
  available: number;
  active: boolean;
  sourceTransactionId: string | null;
  sourceTransactionType: string | null;
  sourceEnvelopeIcn: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Facets {
  categories: Array<{ category: string; count: number }>;
  producers: Array<{ code: string; name: string; count: number }>;
  totalProducts: number;
  inStock: number;
  totalUnits: number;
}

export type BillStatus = 'OPEN' | 'PAID' | 'CANCELLED';
export type EffectiveBillStatus = BillStatus | 'OVERDUE';

export interface Bill {
  id: string;
  billNumber: string;
  orderId: string;
  customerId: string;
  amount: number;
  status: BillStatus;
  effectiveStatus: EffectiveBillStatus;
  issuedAt: string;
  dueDate: string;
  paidAt: string | null;
  order?: { id: string; orderNumber: string; status: string };
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  upc: string;
  sku: string;
  name: string;
  uom: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  product?: { producerName: string; sourceEnvelopeIcn: string | null; category: string };
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  status: 'PLACED' | 'CANCELLED';
  subtotal: number;
  total: number;
  notes: string | null;
  createdAt: string;
  cancelledAt: string | null;
  items: OrderItem[];
  bill: Bill | null;
}

export interface Summary {
  totals: {
    orders: number;
    placed: number;
    cancelled: number;
    spend: number;
    avgOrderValue: number;
    openBills: number;
    openAmount: number;
    overdueBills: number;
    overdueAmount: number;
    paidAmount: number;
    nextDue: Bill | null;
  };
  monthly: Array<{ month: string; orders: number; spend: number; cancelled: number }>;
  daily: Array<{ day: string; orders: number; spend: number }>;
  byCategory: Array<{ category: string; spend: number }>;
  byProducer: Array<{ producer: string; spend: number }>;
  topProducts: Array<{ name: string; quantity: number; spend: number; uom: string }>;
  billStatus: Array<{ status: EffectiveBillStatus; count: number; amount: number }>;
  recentOrders: Order[];
}

export const LOW_STOCK = 25;

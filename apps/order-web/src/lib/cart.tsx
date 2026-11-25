import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Product } from './api';

export interface CartLine {
  productId: string;
  name: string;
  producerName: string;
  category: string;
  uom: string;
  price: number;
  available: number;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  count: number;
  total: number;
  open: boolean;
  setOpen: (o: boolean) => void;
  add: (p: Product, qty?: number) => void;
  setQuantity: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  quantityOf: (productId: string) => number;
}

const KEY = 'hm_cart';
const CartContext = createContext<CartState | null>(null);

function load(): CartLine[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CartLine[];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines]);

  const add = useCallback((p: Product, qty = 1) => {
    setLines((cur) => {
      const existing = cur.find((l) => l.productId === p.id);
      if (existing) {
        return cur.map((l) => (l.productId === p.id ? { ...l, available: p.available, price: p.price, quantity: Math.min(p.available, l.quantity + qty) } : l));
      }
      return [...cur, { productId: p.id, name: p.name, producerName: p.producerName, category: p.category, uom: p.uom, price: p.price, available: p.available, quantity: Math.min(p.available, qty) }];
    });
  }, []);

  const setQuantity = useCallback((productId: string, qty: number) => {
    setLines((cur) =>
      qty <= 0 ? cur.filter((l) => l.productId !== productId) : cur.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(Math.max(1, Math.floor(qty)), l.available || qty) } : l)),
    );
  }, []);

  const remove = useCallback((productId: string) => setLines((cur) => cur.filter((l) => l.productId !== productId)), []);
  const clear = useCallback(() => setLines([]), []);
  const quantityOf = useCallback((productId: string) => lines.find((l) => l.productId === productId)?.quantity ?? 0, [lines]);

  const value = useMemo<CartState>(() => ({
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    total: Math.round(lines.reduce((n, l) => n + l.price * l.quantity, 0) * 100) / 100,
    open,
    setOpen,
    add,
    setQuantity,
    remove,
    clear,
    quantityOf,
  }), [lines, open, add, setQuantity, remove, clear, quantityOf]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}

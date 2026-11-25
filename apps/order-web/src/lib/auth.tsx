import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, tokenStore, type Customer } from './api';

interface AuthState {
  user: Customer | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; company?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api<Customer>('/auth/me')
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string; user: Customer }>('/auth/login', { method: 'POST', json: { email, password } });
    tokenStore.set(r.token);
    qc.clear();
    setUser(r.user);
  }, [qc]);

  const register = useCallback(async (data: { name: string; email: string; password: string; company?: string }) => {
    const r = await api<{ token: string; user: Customer }>('/auth/register', { method: 'POST', json: data });
    tokenStore.set(r.token);
    qc.clear();
    setUser(r.user);
  }, [qc]);

  const logout = useCallback(() => {
    tokenStore.clear();
    qc.clear();
    setUser(null);
  }, [qc]);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

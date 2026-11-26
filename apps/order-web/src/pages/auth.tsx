import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarClock, FileText, Loader2, Truck } from 'lucide-react';
import { Button } from '@edi/ui/components/button';
import { Input } from '@edi/ui/components/input';
import { Label } from '@edi/ui/components/label';
import { toast } from '@edi/ui/components/sonner';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/logo';

const DEMO = [
  { email: 'nova@copperleaf.example', company: 'Copperleaf Kitchen' },
  { email: 'orin@saltglass.example', company: 'Saltglass Grocer' },
  { email: 'ulric@silverspoon.example', company: 'Silverspoon Trattoria' },
];

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-orange-500 via-amber-500 to-lime-600 p-10 text-white lg:flex lg:flex-col">
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-black/10 blur-2xl" />
        <Logo className="relative [&_.text-muted-foreground]:text-white/80 [&>div:first-child]:bg-white [&>div:first-child]:text-orange-600" />
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight">Farm-fresh wholesale, straight from 10 partner producers.</h2>
          <p className="mt-4 text-white/85">Order produce, dairy, meat, grains and pantry staples for your kitchen or store. Stock is synced live from our distributor's EDI feed.</p>
          <ul className="mt-8 space-y-3 text-sm">
            <li className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-lg bg-white/15"><Truck className="size-4" /></span> Inventory updated by producer 832 / 846 / 856 EDI transactions</li>
            <li className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-lg bg-white/15"><FileText className="size-4" /></span> Every order creates an invoice automatically</li>
            <li className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-lg bg-white/15"><CalendarClock className="size-4" /></span> Net 30 payment terms on every bill</li>
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <Logo className="mb-8 lg:hidden" />
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('nova@copperleaf.example');
  const [password, setPassword] = useState('password123');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="text-muted-foreground mt-1 text-sm">Sign in to your wholesale account.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />} Sign in
        </Button>
      </form>
      <div className="bg-muted/60 mt-6 rounded-lg border p-3 text-xs">
        <p className="mb-2 font-medium">Demo accounts (password <code className="font-mono">password123</code>)</p>
        <div className="flex flex-wrap gap-1.5">
          {DEMO.map((d) => (
            <button key={d.email} type="button" onClick={() => { setEmail(d.email); setPassword('password123'); }} className="bg-background hover:border-primary cursor-pointer rounded-md border px-2 py-1 transition-colors">
              {d.company}
            </button>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        New customer? <Link to="/register" className="text-primary font-medium hover:underline">Create an account</Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register(form);
      toast.success('Account created — welcome to Harvest Market!');
      navigate('/shop', { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight">Open a wholesale account</h1>
      <p className="text-muted-foreground mt-1 text-sm">Restaurants, cafés, grocers and caterers welcome.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" value={form.name} onChange={set('name')} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company">Business</Label>
            <Input id="company" value={form.company} onChange={set('company')} placeholder="Optional" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" minLength={6} value={form.password} onChange={set('password')} required />
          <p className="text-muted-foreground text-xs">At least 6 characters.</p>
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Create account
        </Button>
      </form>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}

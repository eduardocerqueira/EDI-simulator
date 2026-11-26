import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Boxes, FileCheck2, Loader2, Package, Workflow } from '@edi/ui/icons';
import { Button } from '@edi/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Input } from '@edi/ui/components/input';
import { Label } from '@edi/ui/components/label';
import { useAuth } from '@/lib/auth';

export function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('admin@harvesthub.local');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={params.get('next') || '/'} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      nav(params.get('next') || '/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="from-primary/90 to-primary relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br p-10 text-white lg:flex">
        <div className="absolute -top-24 -right-24 size-96 rounded-none bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-none bg-black/10 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-none bg-white/15 backdrop-blur">
            <Package className="size-5" />
          </div>
          <div>
            <div className="text-lg font-semibold">Harvest Hub Distribution</div>
            <div className="text-sm text-white/75">EDI Control Center</div>
          </div>
        </div>
        <div className="relative space-y-6">
          <h2 className="text-3xl leading-tight font-semibold">
            Every X12 envelope, <br /> from FTP to inventory — fully traceable.
          </h2>
          <ul className="space-y-3 text-white/85">
            <li className="flex items-center gap-3"><Workflow className="size-5" /> 10 farm producers send 832 / 846 / 856 over FTP</li>
            <li className="flex items-center gap-3"><FileCheck2 className="size-5" /> Validated down to every element, acknowledged with TA1 / 997</li>
            <li className="flex items-center gap-3"><Boxes className="size-5" /> Mapped to JSON, ingested and pushed to the order app</li>
          </ul>
          <pre className="rounded-none bg-black/20 p-4 font-mono text-xs leading-relaxed text-white/90">
{`ISA*00*          *00*          *ZZ*ZEPHYRWOOD     *ZZ*HARVESTHUB     *…~
GS*IB*ZEPHYRWOOD*HARVESTHUB*20261125*1430*1001*X*004010~
ST*846*0001~
BIA*00*DD*INV2611254821*20261125*1430~
LIN**UP*081007000105*VN*ZWG-001~
QTY*33*240*CA~`}
          </pre>
        </div>
        <div className="relative text-xs text-white/60">ANSI X12 004010 learning simulator</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>Distributor administrator console</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />} Sign in
              </Button>
              <p className="text-muted-foreground bg-muted/60 rounded-none p-3 text-xs">
                Demo credentials: <code className="font-mono">admin@harvesthub.local</code> / <code className="font-mono">admin123</code>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

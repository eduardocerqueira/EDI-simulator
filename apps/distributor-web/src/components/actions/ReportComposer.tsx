import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, FlaskConical, Info, Mail, Send } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@edi/ui/components/drawer';
import { Input } from '@edi/ui/components/input';
import { toast } from '@edi/ui/components/sonner';
import { Textarea } from '@edi/ui/components/textarea';
import { BrandLogo } from '@/components/BrandLogo';
import { ErrorState, LoadingRows } from '@/components/common';
import { api } from '@/lib/api';
import { LAYER, PRIORITY } from '@/lib/actions';
import { fmt } from '@/lib/format';

export interface ComposerTarget {
  partnerId: string;
  /** explicit selection; otherwise all OPEN / IN_PROGRESS items (optionally within `days`) */
  itemIds?: string[];
  days?: number;
}

interface Draft {
  partner: { id: string; name: string; isaId: string; specialty: string | null; contactName: string | null; contactEmail: string | null };
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  summary: { interchanges: number; failedTransactions: number; issues: number; codes: Array<{ code: string; interchanges: number; layer: string }> };
  period: { from: string; to: string };
  itemIds: string[];
  items: Array<{ id: string; number: string; title: string; layer: string; priority: string; status: string; occurredAt: string }>;
  attachment: { filename: string; rows: number; size: number };
}

const TEST_ADDRESSES = [
  ['delivered@resend.dev', 'delivered'],
  ['bounced@resend.dev', 'hard bounce'],
  ['complained@resend.dev', 'spam complaint'],
] as const;

const splitAddrs = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Pre-filled exception report e-mail to a producer, sent through the simulated Resend integration. */
export function ReportComposer({ target, onClose, onSent }: { target: ComposerTarget | null; onClose: () => void; onSent?: (reportId: string) => void }) {
  const qc = useQueryClient();
  const draft = useQuery({
    queryKey: ['producer-report-draft', target],
    queryFn: () => api<Draft>('/producer-reports/draft', { method: 'POST', json: target }),
    enabled: !!target,
    staleTime: Infinity,
    gcTime: 0,
  });
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  useEffect(() => {
    if (!draft.data) return;
    setTo(draft.data.to.join(', '));
    setCc('');
    setSubject(draft.data.subject);
    setText(draft.data.text);
  }, [draft.data]);

  const send = useMutation({
    mutationFn: () =>
      api<{ id: string; number: string }>('/producer-reports', {
        method: 'POST',
        json: { partnerId: draft.data!.partner.id, itemIds: draft.data!.itemIds, to: splitAddrs(to), cc: splitAddrs(cc), subject, text, filters: target },
      }),
    onSuccess: (r) => {
      toast.success(`${r.number} sent through Resend (simulated)`, { description: 'Delivery events arrive by webhook in a few seconds.' });
      qc.invalidateQueries({ queryKey: ['action-items'] });
      qc.invalidateQueries({ queryKey: ['producer-reports'] });
      qc.invalidateQueries({ queryKey: ['edi-errors'] });
      onSent?.(r.id);
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const d = draft.data;
  return (
    <Drawer open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent size="lg">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Mail className="size-5" /> Report failures to producer
          </DrawerTitle>
          <DrawerDescription>Review the pre-filled exception report, edit anything, and send it. The CSV with every issue is attached automatically.</DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="space-y-5">
          {draft.isLoading ? (
            <LoadingRows rows={8} />
          ) : draft.error ? (
            <ErrorState error={draft.error} />
          ) : d ? (
            <>
              <div className="bg-info/8 border-info/30 text-foreground flex gap-2 rounded-none border p-3 text-sm">
                <FlaskConical className="text-info mt-0.5 size-4 shrink-0" />
                <div>
                  <b>Simulated Resend integration.</b> No e-mail leaves this machine. The app calls a Resend-compatible API and receives signed webhooks
                  (sent, delivered, opened, bounced) plus the producer&apos;s reply as <code className="font-mono text-xs">email.received</code>.
                </div>
              </div>

              <div className="flex items-center gap-3">
                <BrandLogo name={d.partner.name} kind="producer" hint={d.partner.specialty} size="md" />
                <div className="min-w-0">
                  <div className="font-medium">{d.partner.name}</div>
                  <div className="text-muted-foreground text-xs">
                    ISA ZZ:{d.partner.isaId} · {d.summary.interchanges} interchanges · {d.summary.failedTransactions} rejected transaction sets · {fmt.date(d.period.from)} – {fmt.date(d.period.to)}
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                <Field label="From">
                  <Input value={d.from} disabled />
                </Field>
                <Field label="To" hint="Comma-separated. Try a Resend test inbox:">
                  <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="edi@producer.example" />
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {d.to[0] && (
                      <button type="button" onClick={() => setTo(d.to.join(', '))} className="cursor-pointer">
                        <Badge variant="outline">producer contact</Badge>
                      </button>
                    )}
                    {TEST_ADDRESSES.map(([a, label]) => (
                      <button key={a} type="button" onClick={() => setTo(a)} className="cursor-pointer" title={`Resend test address: ${label}`}>
                        <Badge variant="muted" className="font-mono">
                          {a}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Cc">
                  <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optional" />
                </Field>
                <Field label="Subject" hint="The report number (RPT-…) is added when it is sent.">
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </Field>
                <Field label="Message">
                  <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[320px] font-mono text-xs leading-relaxed" />
                </Field>
              </div>

              <div className="flex items-center gap-3 rounded-none border p-3">
                <FileSpreadsheet className="text-success size-8 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-sm">{d.attachment.filename}</div>
                  <div className="text-muted-foreground text-xs">
                    {d.attachment.rows} rows (one per issue) · {(d.attachment.size / 1024).toFixed(1)} KB · ICN, file, transaction, segment, element, X12 code and meaning
                  </div>
                </div>
                <Badge variant="outline">attachment</Badge>
              </div>

              <details className="rounded-none border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{d.items.length} action items included</summary>
                <ul className="divide-y border-t text-sm">
                  {d.items.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-muted-foreground font-mono text-xs">{i.number}</span>
                      <Badge variant={PRIORITY[i.priority]?.variant ?? 'outline'}>{PRIORITY[i.priority]?.label ?? i.priority}</Badge>
                      <span className="min-w-0 flex-1 truncate">{i.title}</span>
                      <span className="size-2 shrink-0 rounded-none" style={{ background: LAYER[i.layer]?.color }} title={LAYER[i.layer]?.label} />
                    </li>
                  ))}
                </ul>
              </details>
              <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                <Info className="mt-0.5 size-3.5 shrink-0" /> Sending marks these items as <b>Reported</b>. Replies from the producer&apos;s registered contact are attached to the report and
                move the items to <b>Producer replied</b>; mail from anyone else is quarantined.
              </p>
            </>
          ) : null}
        </DrawerBody>
        <DrawerFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => send.mutate()} disabled={!d || send.isPending || !splitAddrs(to).length || !subject.trim() || !text.trim()}>
            <Send /> {send.isPending ? 'Sending…' : 'Send via Resend'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2 text-sm font-medium">
        {label}
        {hint && <span className="text-muted-foreground text-xs font-normal">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
